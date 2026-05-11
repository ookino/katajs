import { buildContainer } from './container';
import { buildDbBundle, type DbAdapter } from './db';
import { ValidationError } from './errors';
import type { Module } from './module';
import type {
  ConsumerSpec,
  ServiceFactory,
  ValidatedBatch,
  ValidatedMessage,
} from './types';

/**
 * Helper for defining a queue consumer with full contextual typing on the
 * `handle` / `handleBatch` parameters. Drives contextual typing for the
 * inner functions so `message.body` is inferred from the schema instead of
 * widening to `unknown`.
 *
 *   export const ordersConsumer = defineConsumer({
 *     queue: 'ORDER_QUEUE',
 *     schema: OrderEventSchema,
 *     async handle(message, c) {
 *       message.body;  // typed as z.infer<typeof OrderEventSchema>
 *     },
 *   });
 */
export function defineConsumer<TBody>(
  spec: ConsumerSpec<TBody>,
): ConsumerSpec<TBody> {
  return spec;
}

/**
 * Cloudflare Queues `Message<Body>` shape, duck-typed to avoid a hard dep on
 * `@cloudflare/workers-types`. Only the fields the framework consumes are
 * declared.
 */
type RawMessage<Body = unknown> = {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: Body;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

type RawBatch<Body = unknown> = {
  readonly queue: string;
  readonly messages: readonly RawMessage<Body>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
};

/** Sender shape for sending DLQ messages. */
type DlqQueueBinding = {
  send(message: unknown, options?: unknown): Promise<void>;
};

/** Public Worker `queue` handler signature. */
export type QueueHandler = (
  batch: RawBatch,
  env: unknown,
  ctx: unknown,
) => Promise<void>;

export type QueueErrorContext = {
  readonly queue: string;
  readonly messageId?: string;
  readonly attempts?: number;
};

export type QueueErrorMapperOptions = {
  /** Hook invoked when a handler throws. Use for Sentry / Logflare / etc. */
  onUnhandled?: (err: unknown, ctx: QueueErrorContext) => void;
};

export type BuildQueueHandlerConfig = {
  readonly modules: readonly Module[];
  readonly registry: ReadonlyMap<string, ServiceFactory<unknown>>;
  /** A single DB adapter, or a map of named adapters for multi-database apps. */
  readonly db: DbAdapter | Record<string, DbAdapter>;
  readonly errorMapper?: QueueErrorMapperOptions;
  /** Override `crypto.randomUUID` for deterministic tests. Used as fallback when message has no `id`. */
  readonly generateRequestId?: () => string;
};

const DEFAULT_MAX_RETRIES = 3;

/**
 * Build a `queue` handler that dispatches incoming batches to the right
 * consumer module based on `batch.queue`. Returns `undefined` if no module
 * has a `consumer:` field — in which case the Worker should not export
 * `queue` at all.
 *
 * Per-message handlers (consumer.handle) get one container per message and
 * the framework auto-acks on success, auto-retries on throw, and routes to
 * the DLQ after `maxRetries` attempts.
 *
 * Batch handlers (consumer.handleBatch) get one container per batch. The
 * user is responsible for calling `msg.ack()` / `msg.retry()` per message.
 */
export function buildQueueHandler(
  config: BuildQueueHandlerConfig,
): QueueHandler | undefined {
  const consumersByQueue = new Map<string, { module: Module; consumer: ConsumerSpec }>();
  for (const m of config.modules) {
    if (!m.consumer) continue;
    if (consumersByQueue.has(m.consumer.queue)) {
      const owner = consumersByQueue.get(m.consumer.queue)!.module.name;
      throw new Error(
        `[katajs] Duplicate queue consumer for binding '${m.consumer.queue}': ` +
          `modules '${owner}' and '${m.name}' both consume it.`,
      );
    }
    consumersByQueue.set(m.consumer.queue, { module: m, consumer: m.consumer });
  }

  if (consumersByQueue.size === 0) return undefined;

  return async function queue(batch, env) {
    const entry = consumersByQueue.get(batch.queue);
    if (!entry) {
      // No consumer registered for this queue. Best we can do is retry — the
      // user almost certainly mis-configured wrangler.jsonc.
      const known = [...consumersByQueue.keys()].join(', ') || '(none)';
      throw new Error(
        `[katajs] No consumer registered for queue '${batch.queue}'. ` +
          `Known consumer bindings: ${known}.`,
      );
    }

    const { consumer } = entry;
    const db = buildDbBundle(config.db, env);
    const sharedContainerArgs = {
      env,
      registry: config.registry,
      db,
      inTransaction: false,
    };

    if ('handleBatch' in consumer && consumer.handleBatch) {
      // Batch mode: one container, user controls ack/retry per message.
      const requestId = config.generateRequestId?.() ?? cryptoRandomUUID();

      // Validate every message body up-front. Invalid messages are routed
      // to DLQ (or acked) so they don't poison the batch.
      const validated: ValidatedMessage<unknown>[] = [];
      for (const msg of batch.messages) {
        try {
          const body = consumer.schema.parse(msg.body);
          validated.push(makeValidatedMessage(msg, body));
        } catch (err) {
          await onMessageFailure(msg, consumer, env, err, config.errorMapper, batch.queue);
        }
      }

      if (validated.length === 0) return;

      const container = buildContainer({
        ...sharedContainerArgs,
        requestId,
      });

      const validatedBatch: ValidatedBatch<unknown> = {
        queue: batch.queue,
        messages: validated,
        ackAll: () => batch.ackAll(),
        retryAll: (opts) => batch.retryAll(opts),
      };

      try {
        await consumer.handleBatch(validatedBatch, container);
      } catch (err) {
        config.errorMapper?.onUnhandled?.(err, { queue: batch.queue });
        // User didn't catch — retry the whole batch.
        batch.retryAll();
      }
      return;
    }

    // Per-message mode: one container per message, auto-ack on success.
    if (!('handle' in consumer) || !consumer.handle) {
      throw new Error(
        `[katajs] Consumer for '${batch.queue}' (module '${entry.module.name}') has neither 'handle' nor 'handleBatch'.`,
      );
    }

    const handle = consumer.handle;

    for (const msg of batch.messages) {
      // Validate first — bad bodies route through DLQ machinery.
      let body: unknown;
      try {
        body = consumer.schema.parse(msg.body);
      } catch (err) {
        const wrapped = err instanceof ValidationError ? err : err;
        await onMessageFailure(msg, consumer, env, wrapped, config.errorMapper, batch.queue);
        continue;
      }

      const container = buildContainer({
        ...sharedContainerArgs,
        requestId: msg.id,
      });

      try {
        await handle(makeValidatedMessage(msg, body), container);
        msg.ack();
      } catch (err) {
        await onMessageFailure(msg, consumer, env, err, config.errorMapper, batch.queue);
      }
    }
  };
}

function makeValidatedMessage<Body>(
  raw: RawMessage<unknown>,
  body: Body,
): ValidatedMessage<Body> {
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    body,
    attempts: raw.attempts,
    ack: () => raw.ack(),
    retry: (opts) => raw.retry(opts),
  };
}

/**
 * Handle a single message failure: report via errorMapper, then either
 * retry or send to DLQ depending on attempts vs maxRetries.
 */
async function onMessageFailure(
  msg: RawMessage<unknown>,
  consumer: ConsumerSpec,
  env: unknown,
  err: unknown,
  errorMapper: QueueErrorMapperOptions | undefined,
  queue: string,
): Promise<void> {
  errorMapper?.onUnhandled?.(err, {
    queue,
    messageId: msg.id,
    attempts: msg.attempts,
  });

  const maxRetries = consumer.maxRetries ?? DEFAULT_MAX_RETRIES;

  // CF Queues `attempts` is 1-based on the first delivery attempt.
  if (msg.attempts >= maxRetries) {
    if (consumer.dlq) {
      const dlqBinding = (env as Record<string, unknown> | null | undefined)?.[
        consumer.dlq
      ] as DlqQueueBinding | undefined;
      if (dlqBinding && typeof dlqBinding.send === 'function') {
        try {
          await dlqBinding.send({
            originalQueue: queue,
            messageId: msg.id,
            body: msg.body,
            error: err instanceof Error ? err.message : String(err),
            attempts: msg.attempts,
            failedAt: new Date().toISOString(),
          });
          msg.ack();
          return;
        } catch (dlqErr) {
          errorMapper?.onUnhandled?.(dlqErr, {
            queue: consumer.dlq,
            messageId: msg.id,
          });
          // DLQ send failed — fall through to retry so we don't lose the message.
        }
      } else {
        // DLQ binding not present at runtime — drop with a clear error log.
        errorMapper?.onUnhandled?.(
          new Error(
            `[katajs] DLQ binding '${consumer.dlq}' not found on env. Acking message ${msg.id} to avoid loops.`,
          ),
          { queue, messageId: msg.id },
        );
        msg.ack();
        return;
      }
    } else {
      // No DLQ — ack to break the retry loop.
      msg.ack();
      return;
    }
  }

  msg.retry();
}

function cryptoRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for very minimal runtimes.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
