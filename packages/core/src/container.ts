import type { Context } from 'hono';
import { DEFAULT_DB, withTxClient, type DbBundle } from './db';
import type {
  AppDb,
  ProvidesMap,
  RequestContainer,
  ServiceFactory,
} from './types';

/**
 * Build a `resolve` function backed by the given registry. Per spec §4.3:
 * - First call to `resolve(key)` constructs via the factory and caches.
 * - Subsequent calls return the cached instance.
 * - In-progress detection throws on circular dependencies with the resolution stack.
 * - Missing keys throw with the list of registered keys.
 *
 * `containerView` is whatever object the factories should receive as their
 * single argument. The container that owns this resolver passes itself in.
 */
export function makeResolver(
  registry: ReadonlyMap<string, ServiceFactory<unknown>>,
  containerView: object,
): (key: string) => unknown {
  const cache = new Map<string, unknown>();
  const inProgress = new Set<string>();

  return function resolve(key: string): unknown {
    if (cache.has(key)) {
      return cache.get(key);
    }

    if (inProgress.has(key)) {
      const stack = [...inProgress, key].join(' -> ');
      throw new Error(
        `[katajs] Circular dependency detected while resolving '${key}'. ` +
          `Resolution stack: ${stack}`,
      );
    }

    const factory = registry.get(key);
    if (!factory) {
      const known = [...registry.keys()].sort().join(', ') || '(none)';
      throw new Error(
        `[katajs] No service registered for key '${key}'. Registered keys: ${known}`,
      );
    }

    inProgress.add(key);
    try {
      const instance = factory(containerView as never);
      cache.set(key, instance);
      return instance;
    } finally {
      inProgress.delete(key);
    }
  };
}

/** Flatten a list of `Module.provides` maps into a single registry. */
export function buildRegistry(
  providesMaps: readonly ProvidesMap[],
): Map<string, ServiceFactory<unknown>> {
  const registry = new Map<string, ServiceFactory<unknown>>();
  for (const provides of providesMaps) {
    for (const [key, factory] of Object.entries(provides)) {
      registry.set(key, factory as ServiceFactory<unknown>);
    }
  }
  return registry;
}

/**
 * Stub Hono Context used in queue containers. Queue handlers don't have a
 * real HTTP context — accessing one would be a programming error in user
 * code (a service trying to read `c.req` from a queue context). The proxy
 * throws on any access to surface the bug clearly.
 */
const queueContextStub: Context = new Proxy({} as Context, {
  get(_, prop) {
    throw new Error(
      `[katajs] This service tried to access Hono Context property '${String(prop)}', but it's running in a queue handler (no HTTP context exists). Refactor the service to read what it needs from \`container.env\` / \`container.requestId\` instead.`,
    );
  },
}) as Context;

export type BuildContainerArgs = {
  readonly env: unknown;
  /** Hono Context for HTTP requests; omit for queue/cron contexts. */
  readonly c?: Context;
  readonly requestId: string;
  /** The normalized per-request database layer. */
  readonly db: DbBundle;
  readonly registry: ReadonlyMap<string, ServiceFactory<unknown>>;
  readonly inTransaction: boolean;
};

/**
 * Build a `RequestContainer` for either an HTTP request or a queue message.
 * Each invocation produces a fresh container with its own resolve cache and
 * `withTransaction` closure.
 *
 * `withTransaction` is overloaded:
 * - single-db apps call `withTransaction(fn)`;
 * - multi-db apps call `withTransaction(name, fn)`.
 * At runtime the first argument's type discriminates. The sub-container passed
 * to `fn` has the relevant db's client swapped for the transaction handle
 * (other dbs, if any, are unchanged — no cross-database transactions). Nested
 * calls reuse the outer transaction (no savepoints in v0.1).
 */
export function buildContainer(args: BuildContainerArgs): RequestContainer {
  const container = {
    env: args.env as never,
    c: args.c ?? queueContextStub,
    requestId: args.requestId,
    db: args.db.view as AppDb,
  } as unknown as RequestContainer;

  (container as { resolve: RequestContainer['resolve'] }).resolve = makeResolver(
    args.registry,
    container,
  ) as RequestContainer['resolve'];

  const withTransaction = async (...callArgs: unknown[]): Promise<unknown> => {
    let name: string;
    let fn: (tx: RequestContainer) => Promise<unknown>;

    if (typeof callArgs[0] === 'string') {
      name = callArgs[0];
      fn = callArgs[1] as (tx: RequestContainer) => Promise<unknown>;
      if (!args.db.multi) {
        throw new Error(
          `[katajs] withTransaction('${name}', fn) — this app has a single database. ` +
            `Call withTransaction(fn) instead.`,
        );
      }
    } else {
      fn = callArgs[0] as (tx: RequestContainer) => Promise<unknown>;
      if (args.db.multi) {
        const names = Object.keys(args.db.adapters).join(', ');
        throw new Error(
          `[katajs] withTransaction(fn) — this app has multiple databases. ` +
            `Call withTransaction(<name>, fn). Known: ${names}.`,
        );
      }
      name = DEFAULT_DB;
    }

    if (args.inTransaction) {
      // Nested call — reuse the outer transaction (no savepoints in v0.1).
      return fn(container);
    }

    const adapter = args.db.adapters[name];
    if (!adapter) {
      const names = Object.keys(args.db.adapters).join(', ');
      throw new Error(`[katajs] No database named '${name}'. Known: ${names}.`);
    }
    if (!adapter.runTransaction) {
      throw new Error(
        `[katajs] The ${args.db.multi ? `'${name}'` : 'configured'} db adapter ` +
          `does not support transactions (no 'runTransaction' method).`,
      );
    }

    return adapter.runTransaction(args.db.clients[name], async (txClient) => {
      const txContainer = buildContainer({
        ...args,
        db: withTxClient(args.db, name, txClient),
        inTransaction: true,
      });
      return fn(txContainer);
    });
  };

  (container as { withTransaction: RequestContainer['withTransaction'] }).withTransaction =
    withTransaction as RequestContainer['withTransaction'];

  return container;
}
