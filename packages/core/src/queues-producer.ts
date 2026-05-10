import { ValidationError } from './errors';
import type {
  QueueDeclaration,
  SendBatchOptions,
  SendOptions,
  TypedQueue,
} from './types';

/**
 * Build the runtime `c.var.queues` object from the producer manifest.
 *
 * Each entry becomes a `TypedQueue` that validates with the declared schema
 * before delegating to the underlying Cloudflare `env[binding].send(...)`.
 * Validation failure throws `ValidationError` — the same shape consumers
 * see — so producer-side bugs surface synchronously at the call site.
 */
export function buildTypedQueues(
  declarations: Record<string, QueueDeclaration>,
  env: unknown,
): Record<string, TypedQueue<unknown>> {
  const out: Record<string, TypedQueue<unknown>> = {};
  for (const [name, decl] of Object.entries(declarations)) {
    out[name] = makeTypedQueue(name, decl, env);
  }
  return out;
}

function makeTypedQueue(
  name: string,
  decl: QueueDeclaration,
  env: unknown,
): TypedQueue<unknown> {
  const binding = (env as Record<string, unknown> | null | undefined)?.[
    decl.binding
  ] as
    | {
        send(body: unknown, options?: unknown): Promise<void>;
        sendBatch?(bodies: unknown, options?: unknown): Promise<void>;
      }
    | undefined;

  return {
    async send(body: unknown, options?: SendOptions): Promise<void> {
      const validated = validateOrThrow(name, decl, body);
      assertBinding(name, decl.binding, binding);
      await binding.send(validated, options);
    },
    async sendBatch(bodies: readonly unknown[], options?: SendBatchOptions): Promise<void> {
      const validated = bodies.map((b) => validateOrThrow(name, decl, b));
      assertBinding(name, decl.binding, binding);
      if (typeof binding.sendBatch === 'function') {
        // Cloudflare's MessageSendRequest shape: { body, contentType?, delaySeconds? }
        const messages = validated.map((body) => ({ body }));
        await binding.sendBatch(messages, options);
        return;
      }
      // Fallback: send one-by-one if the binding doesn't expose sendBatch.
      for (const body of validated) {
        await binding.send(body, options);
      }
    },
  };
}

function validateOrThrow(
  queueName: string,
  decl: QueueDeclaration,
  body: unknown,
): unknown {
  try {
    return decl.schema.parse(body);
  } catch (err) {
    // Wrap in our ValidationError so error mapping is consistent. Path is
    // prefixed with the queue name so producer-side validation issues are
    // distinguishable from HTTP body issues in logs.
    const issues =
      err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown }).issues)
        ? (err as { issues: Array<{ path?: unknown; message?: unknown }> }).issues.map((i) => ({
            path: [
              `queues.${queueName}`,
              ...(Array.isArray(i.path) ? (i.path as (string | number)[]) : []),
            ],
            message: typeof i.message === 'string' ? i.message : 'Invalid',
          }))
        : [
            {
              path: [`queues.${queueName}`],
              message: err instanceof Error ? err.message : String(err),
            },
          ];
    throw new ValidationError(issues);
  }
}

function assertBinding(
  queueName: string,
  bindingName: string,
  binding: unknown,
): asserts binding is { send(body: unknown, options?: unknown): Promise<void> } {
  if (!binding || typeof (binding as { send?: unknown }).send !== 'function') {
    throw new Error(
      `[katajs] Queue '${queueName}': binding '${bindingName}' is not registered as a producer in wrangler.jsonc, or env doesn't have it. ` +
        `Add a producer entry for this binding in your wrangler config.`,
    );
  }
}
