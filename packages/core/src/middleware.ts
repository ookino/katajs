import type { MiddlewareHandler } from 'hono';
import { buildContainer } from './container';
import type {
  AppDb,
  ProvidesMap,
  RequestContainer,
  ServiceFactory,
} from './types';

/**
 * Hono Variables shape contributed by katajs's container middleware.
 *
 * `resolve` and `withTransaction` are convenience handles mounted directly on
 * `c.var` so route handlers can write `c.var.resolve('postService')` instead
 * of `c.var.container.resolve('postService')`. Same types, same behaviour —
 * just one access shallower at the call site.
 */
export type RequestVariables = {
  container: RequestContainer;
  requestId: string;
  resolve: RequestContainer['resolve'];
  withTransaction: RequestContainer['withTransaction'];
};

/**
 * Adapter contract for the database layer. `create` is called once per request
 * to produce the per-request client; `runTransaction` (optional) runs a callback
 * inside a transaction with a transaction-bound client (`txDb`).
 *
 * The `db` and `txDb` types are intentionally loose (`any`) at the adapter
 * boundary because, e.g., Drizzle's `DrizzleClient` and `DrizzleTx` are
 * different types with the same query API. User code should rely on the
 * augmented `AppDb` interface to type `c.db`, treating the client and tx as
 * interchangeable for repository code (per spec §6.4).
 */
export type DbAdapter = {
  create(env: unknown): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTransaction?<T>(db: any, fn: (txDb: any) => Promise<T>): Promise<T>;
};

export type ContainerMiddlewareConfig = {
  registry: ReadonlyMap<string, ServiceFactory<unknown>>;
  db: DbAdapter;
  /** Override `crypto.randomUUID` for deterministic tests. */
  generateRequestId?: () => string;
};

/**
 * Build a fresh container per request. Sets `container`, `requestId`,
 * `resolve`, and `withTransaction` on `c.var` (so handlers can use either
 * the full `c.var.container` or the shortcuts directly), and writes the
 * `X-Request-Id` header. Installed first by `createApp`.
 */
export function containerMiddleware(config: ContainerMiddlewareConfig): MiddlewareHandler {
  return async (c, next) => {
    const requestId = config.generateRequestId
      ? config.generateRequestId()
      : crypto.randomUUID();

    const db = config.db.create(c.env) as AppDb;

    const container = buildContainer({
      env: c.env,
      c,
      requestId,
      db,
      registry: config.registry,
      runTransaction: config.db.runTransaction,
      inTransaction: false,
    });

    c.set('container', container);
    c.set('requestId', requestId);
    c.set('resolve', container.resolve);
    c.set('withTransaction', container.withTransaction);
    c.header('X-Request-Id', requestId);

    await next();
  };
}

/**
 * Typed-identity helper for user-defined middleware. Lets the user write
 * `c.var.container` (and the shortcuts) without authoring the env generics inline.
 */
export function defineMiddleware<
  Env extends { Variables: RequestVariables } = { Variables: RequestVariables },
>(handler: MiddlewareHandler<Env>): MiddlewareHandler<Env> {
  return handler;
}

export type { ProvidesMap };
