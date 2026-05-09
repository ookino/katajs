import type { Context } from 'hono';

/**
 * Globally-augmentable registry mapping service keys to their resolved types.
 *
 * **Required.** Augment in your app's `types.d.ts`:
 *
 *   declare module '@katajs/core' {
 *     interface Registry extends PostsRegistry, EventsRegistry {}
 *   }
 *
 * Without augmentation, `Registry` is empty, `RegistryKey` is `never`, and
 * every `c.var.container.resolve(...)` call fails to compile — by design.
 * That's the loud-failure mode that tells you "wire up your registry."
 */
export interface Registry {}

/** Bindings shape (Cloudflare env). Augment via module declaration to type `c.env`. */
export interface AppEnv {}

/** Drizzle (or compatible) client shape. Augment via module declaration to type `c.db`. */
export interface AppDb {}

export type RegistryKey = keyof Registry & string;

export type ResolveOf<K extends string> = K extends RegistryKey ? Registry[K] : unknown;

export type ServiceFactory<T = unknown> = (c: any) => T;

export type ProvidesMap = Record<string, ServiceFactory<unknown>>;

/** Common members shared by every container view. */
export interface BaseContainer {
  readonly env: AppEnv;
  readonly c: Context;
  readonly requestId: string;
  readonly db: AppDb;
}

/**
 * Registry-scoped container view used by route handlers, middleware, and any
 * code outside a module's `provides` factory. `resolve` accepts only keys in
 * the augmented `Registry` — typos and unknown keys are TS errors.
 */
export interface RequestContainer extends BaseContainer {
  resolve<K extends RegistryKey>(key: K): Registry[K];
  withTransaction<T>(fn: (tx: RequestContainer) => Promise<T>): Promise<T>;
}

/**
 * Module-scoped container view passed to a module's service factories.
 * Adds narrow overloads on top of `RequestContainer.resolve` so calls with
 * keys in own `provides` or declared `requires` resolve to specific types.
 * Calls with any other key fall through to the inherited Registry-scoped
 * resolve — typos are still rejected.
 */
export interface ModuleContainer<
  PSelf extends Record<string, unknown> = Record<string, unknown>,
  RKeys extends string = never,
> extends RequestContainer {
  resolve<K extends keyof PSelf & string>(key: K): PSelf[K];
  resolve<K extends RKeys>(
    key: K,
  ): K extends RegistryKey ? Registry[K] : unknown;
}

/**
 * Transactional view of the container, passed to the `withTransaction`
 * callback. Same shape as `RequestContainer`; `db` and any repo resolved via
 * `tx.resolve` are bound to the transaction handle.
 */
export type TransactionalContainer = RequestContainer;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

/** Merge all `provides` maps from a tuple of modules into a single map. */
export type MergeProvides<Mods extends readonly { provides: ProvidesMap }[]> =
  UnionToIntersection<Mods[number]['provides']> extends infer M
    ? M extends ProvidesMap
      ? M
      : ProvidesMap
    : ProvidesMap;

/**
 * Resolve a `provides` map to its return-type map: every factory is replaced
 * by the type of value it produces. The shape `Registry` should augment to.
 */
export type ResolveProvides<P extends ProvidesMap> = {
  [K in keyof P]: P[K] extends ServiceFactory<infer T> ? T : never;
};

/**
 * Build a `Registry`-compatible type from a tuple of modules. Use it to
 * auto-derive the framework's augmentable `Registry` interface from your
 * `modules` array — adding a module flows its services through automatically:
 *
 *   const modules = [postsModule, authModule] as const;
 *
 *   declare module '@katajs/core' {
 *     interface Registry extends ResolvedProvides<typeof modules> {}
 *   }
 *
 *   const { app: base } = createApp({ db, modules });
 */
export type ResolvedProvides<Mods extends readonly { provides: ProvidesMap }[]> =
  ResolveProvides<MergeProvides<Mods>>;

/**
 * A list of required service keys, always declared with `as const`.
 *
 * Constrained to `RegistryKey` so the editor autocompletes valid services
 * inside `requires: ['▌']` and a typo or fake service name fails to compile.
 *
 *   requires: ['auditService'] as const     // ✓
 *   requires: ['auditServeice'] as const    // ✗ TS error: not assignable to RegistryKey
 *   requires: [] as const                    // ✓ no cross-module deps
 */
export type RequiresList = readonly RegistryKey[];

/* ---------------------------------------------------------------------------
 * Queue consumer types
 *
 * Minimal duck-typed shapes for Cloudflare Queues' runtime objects so the
 * framework doesn't need a hard dep on `@cloudflare/workers-types`. Compatible
 * with Cloudflare's `Message<T>` and `MessageBatch<T>` at runtime.
 * --------------------------------------------------------------------------- */

/**
 * A queue message after `consumer.schema` has parsed its body. Mirrors the
 * Cloudflare Queues `Message<Body>` shape, with `body` typed as the parsed
 * value.
 */
export interface ValidatedMessage<Body> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: Body;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

/**
 * A batch of validated messages. Mirrors Cloudflare's `MessageBatch<Body>`.
 * Used by `handleBatch` consumers that want full control over per-message
 * acking / retry instead of the per-message auto-ack default.
 */
export interface ValidatedBatch<Body> {
  readonly queue: string;
  readonly messages: readonly ValidatedMessage<Body>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
}

/** Per-message handler: framework auto-acks on return, auto-retries on throw. */
export type ConsumerHandler<Body> = (
  message: ValidatedMessage<Body>,
  c: RequestContainer,
) => Promise<void>;

/** Batch handler: user controls ack/retry by calling msg.ack() / msg.retry(). */
export type ConsumerBatchHandler<Body> = (
  batch: ValidatedBatch<Body>,
  c: RequestContainer,
) => Promise<void>;

/**
 * Minimal `ZodSchema`-like shape so the framework doesn't take a hard dep on
 * `zod`. Any `ZodSchema` instance satisfies it.
 */
export interface MessageSchema<Output = unknown> {
  parse(input: unknown): Output;
}

/**
 * Declares a queue consumer for a module. Exactly one of `handle` (per-
 * message, auto-ack) or `handleBatch` (batch, manual control) is required.
 *
 * On retry exhaustion (attempts >= maxRetries), if `dlq` is set, the message
 * is sent to that binding and the original is acked. Otherwise the message
 * is acked (dropped) so it doesn't loop forever.
 */
export type ConsumerSpec<TSchema extends MessageSchema = MessageSchema> = {
  /** wrangler binding name for the queue this module consumes. */
  readonly queue: string;
  /** Zod (or compatible) schema validating message bodies. */
  readonly schema: TSchema;
  /** Optional wrangler binding name for the dead-letter queue. */
  readonly dlq?: string;
  /** Max attempts before routing to DLQ (or dropping). Default: 3. */
  readonly maxRetries?: number;
} & (
  | {
      readonly handle: ConsumerHandler<InferSchema<TSchema>>;
      readonly handleBatch?: never;
    }
  | {
      readonly handleBatch: ConsumerBatchHandler<InferSchema<TSchema>>;
      readonly handle?: never;
    }
);

/** Extract the `parse(...)` return type from a `MessageSchema`. */
export type InferSchema<S> = S extends MessageSchema<infer Out> ? Out : unknown;
