import { Hono, type MiddlewareHandler } from 'hono';
import { buildRegistry } from './container';
import {
  containerMiddleware,
  type DbAdapter,
  type RequestVariables,
} from './middleware';
import { errorMapper, type ErrorMapperOptions } from './errors';
import type { Module } from './module';
import {
  buildQueueHandler,
  type QueueErrorMapperOptions,
  type QueueHandler,
} from './queue';

/** Base Hono app produced by `createApp` (middleware + onError, no routes mounted). */
export type BaseApp = Hono<{ Variables: RequestVariables }>;

export type AppConfig<
  Modules extends readonly Module[] = readonly Module[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChainResult extends Hono<any, any, any> = BaseApp,
> = {
  /**
   * Type-only marker for the bindings shape (Cloudflare env). Pass `{} as YourBindings`.
   * v0.1 doesn't propagate bindings to the Hono generic — augment `AppEnv` if you need it.
   */
  bindings?: unknown;

  /** The DB adapter (e.g., `drizzleAdapter()`). */
  db: DbAdapter;

  /** Modules to compose. Order doesn't affect behaviour but is the boot validation order. */
  modules: Modules;

  /**
   * User middleware that runs after the container middleware and before any
   * route handler. Use this for cross-cutting concerns like logging or auth
   * gates. The error handler is wired automatically via `app.onError`.
   */
  middleware?: MiddlewareHandler[];

  /** Options for the auto-wired errorMapper. Pass `onUnhandled` to log to Sentry, etc. */
  errorMapper?: ErrorMapperOptions;

  /**
   * Options for the queue-side error mapper. Distinct from the HTTP `errorMapper`
   * because queue failures don't render an HTTP response — they retry or DLQ.
   * Pass `onUnhandled` to log queue handler failures to Sentry / Logflare / etc.
   */
  queueErrorMapper?: QueueErrorMapperOptions;

  /** Override `crypto.randomUUID` for deterministic tests. */
  generateRequestId?: () => string;

  /**
   * Define the app's HTTP surface. Receives the framework-prepared base app
   * (with container middleware + error mapper already wired) and returns the
   * fully chained app. The chain happens via Hono's native `.route()` /
   * `.get()` / `.post()` etc., so Hono RPC end-to-end types are preserved.
   *
   *   routes: (base) => base
   *     .get('/health', (c) => c.json({ ok: true }))
   *     .route(postsModule.prefix, postsModule.routes)
   *
   * Omit this option to get the bare base app back; you can then chain
   * routes externally (the original two-step pattern).
   */
  routes?: (base: BaseApp) => ChainResult;
};

/**
 * Compose modules into a Hono app. Performs three boot-time checks (per spec §10.2):
 *   1. No duplicate `provides` keys across modules.
 *   2. Every key in any module's `requires` is provided by some module.
 *   3. No module dependency cycles.
 *
 * Throws with a self-explanatory message on any failure (per spec §10.4).
 *
 *   const { app } = createApp({
 *     db: drizzleAdapter({ schema }),
 *     modules: [eventsModule, auditModule, postsModule],
 *     routes: (base) => base
 *       .get('/health', (c) => c.json({ ok: true }))
 *       .route(postsModule.prefix, postsModule.routes),
 *   });
 *   export type AppType = typeof app; // RPC types preserved
 *   export default app;
 */
export function createApp<
  const Modules extends readonly Module[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChainResult extends Hono<any, any, any> = BaseApp,
>(
  config: AppConfig<Modules, ChainResult>,
): {
  app: ChainResult;
  modules: Modules;
  /**
   * Cloudflare Queues handler. Defined when at least one module declares a
   * `consumer:` field; `undefined` otherwise. Wire it into the Worker default
   * export alongside `fetch` to consume queue messages:
   *
   *   export default { fetch: app.fetch, queue };
   */
  queue: QueueHandler | undefined;
} {
  validateModules(config.modules);

  const registry = buildRegistry(config.modules.map((m) => m.provides));

  const base = new Hono<{ Variables: RequestVariables }>();

  base.use(
    '*',
    containerMiddleware({
      registry,
      db: config.db,
      generateRequestId: config.generateRequestId,
    }),
  );

  for (const mw of config.middleware ?? []) {
    base.use('*', mw);
  }

  base.onError(errorMapper(config.errorMapper));

  const app = (config.routes ? config.routes(base) : base) as ChainResult;

  const queue = buildQueueHandler({
    modules: config.modules,
    registry,
    db: config.db,
    errorMapper: config.queueErrorMapper,
    generateRequestId: config.generateRequestId,
  });

  return { app, modules: config.modules, queue };
}

function validateModules(modules: readonly Module[]): void {
  // 1. Duplicate provides
  const provideOwners = new Map<string, string>();
  for (const m of modules) {
    for (const key of Object.keys(m.provides)) {
      const existing = provideOwners.get(key);
      if (existing) {
        throw new Error(
          `[katajs] Duplicate provides key '${key}'.\n` +
            `Provided by: '${existing}' and '${m.name}'.\n` +
            `Pick one module to own this key.`,
        );
      }
      provideOwners.set(key, m.name);
    }
  }

  // 2. Missing requires
  const allKeys = [...provideOwners.keys()];
  const moduleNames = modules.map((m) => m.name);
  for (const m of modules) {
    for (const key of m.requires) {
      if (!provideOwners.has(key)) {
        throw new Error(
          `[katajs] Module '${m.name}' requires '${key}', but no module provides it.\n` +
            `Modules registered: ${moduleNames.join(', ') || '(none)'}.\n` +
            `Provided keys: ${allKeys.join(', ') || '(none)'}.\n` +
            `Did you forget to add the providing module to createApp({ modules: [...] })?`,
        );
      }
    }
  }

  // 3. Module dependency cycle (M depends on N if M requires a key N provides).
  const moduleByName = new Map<string, Module>(modules.map((m) => [m.name, m]));
  const edges = new Map<string, Set<string>>();
  for (const m of modules) {
    const deps = new Set<string>();
    for (const key of m.requires) {
      const ownerName = provideOwners.get(key);
      if (ownerName && ownerName !== m.name) deps.add(ownerName);
    }
    edges.set(m.name, deps);
  }

  const cycle = findCycle(edges);
  if (cycle) {
    throw new Error(
      `[katajs] Module dependency cycle detected.\n` +
        `Cycle: ${cycle.join(' -> ')}.\n` +
        `Modules cannot transitively require services from each other.`,
    );
  }
  // Reference moduleByName so unused-vars stays clean if we later need it.
  void moduleByName;
}

function findCycle(edges: Map<string, Set<string>>): string[] | undefined {
  const VISITING = 1;
  const VISITED = 2;
  const state = new Map<string, number>();
  const stack: string[] = [];

  function visit(node: string): string[] | undefined {
    const s = state.get(node);
    if (s === VISITED) return undefined;
    if (s === VISITING) {
      const idx = stack.indexOf(node);
      return [...stack.slice(idx), node];
    }
    state.set(node, VISITING);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    stack.pop();
    state.set(node, VISITED);
    return undefined;
  }

  for (const node of edges.keys()) {
    const found = visit(node);
    if (found) return found;
  }
  return undefined;
}
