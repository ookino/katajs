import type { Context } from 'hono';
import type { AppDb, AppEnv, RegistryKey, Registry, RequestContainer } from './types';

export type TestContainerOptions = {
  /**
   * Map of service keys to their fake instances. Looked up by `c.resolve(key)`.
   * Untyped intentionally — pass whatever shape your service-under-test expects.
   */
  services?: Partial<Record<RegistryKey, unknown>>;
  /** Fake DB handle. Defaults to an empty object. */
  db?: AppDb;
  /** Fake bindings (`c.env`). Defaults to empty. */
  env?: AppEnv;
  /** Request id seen by the service under test. Defaults to `'test-request'`. */
  requestId?: string;
  /**
   * Custom transaction runner. If omitted, `withTransaction(fn)` calls
   * `fn(thisContainer)` synchronously — i.e., transactions become no-ops.
   * Override when you want to assert tx-only behaviour.
   */
  runTransaction?: <T>(fn: (tx: RequestContainer) => Promise<T>) => Promise<T>;
};

/**
 * Build a fake `RequestContainer` for unit-testing services without spinning
 * up Hono or a real DB. Locks the public shape of `RequestContainer` — if the
 * framework changes the container's surface, this helper signal-fails next
 * compile, so test files don't silently rot.
 *
 *   import { makeTestContainer } from '@katajs/core/testing';
 *
 *   const insert = vi.fn().mockResolvedValue({ id: '1', title: 't' });
 *   const log = vi.fn();
 *
 *   const c = makeTestContainer({
 *     services: {
 *       postRepository: { findById: vi.fn(), insert },
 *       auditService: { log },
 *     },
 *   });
 *
 *   const service = makePostService(c);
 *   await service.create({ title: 't', body: 'b', authorId: 'alice' });
 *
 *   expect(insert).toHaveBeenCalled();
 *   expect(log).toHaveBeenCalled();
 *
 * Best for testing service logic in isolation. Use the showcase's
 * integration-test pattern (real Postgres) when you need to verify SQL
 * behaviour — that's outside this helper's scope.
 */
export function makeTestContainer(opts: TestContainerOptions = {}): RequestContainer {
  const services = (opts.services ?? {}) as Record<string, unknown>;

  const container = {
    env: (opts.env ?? {}) as AppEnv,
    c: {} as Context,
    requestId: opts.requestId ?? 'test-request',
    db: (opts.db ?? ({} as AppDb)),
  } as RequestContainer;

  const resolve = ((key: string) => {
    if (!(key in services)) {
      throw new Error(
        `[makeTestContainer] No service registered for key '${key}'. ` +
          `Pass it via \`services: { ${key}: ... }\`. ` +
          `Currently registered: ${Object.keys(services).join(', ') || '(none)'}.`,
      );
    }
    return services[key];
  }) as RequestContainer['resolve'];

  const withTransaction = (async <T>(fn: (tx: RequestContainer) => Promise<T>): Promise<T> => {
    if (opts.runTransaction) return opts.runTransaction(fn);
    return fn(container);
  }) as RequestContainer['withTransaction'];

  (container as { resolve: RequestContainer['resolve'] }).resolve = resolve;
  (container as { withTransaction: RequestContainer['withTransaction'] }).withTransaction =
    withTransaction;

  return container;
}

/** Reference type for opting in to `Registry` keys without `as` casts in tests. */
export type TestServices = Partial<{
  [K in RegistryKey]: Registry[K];
}>;
