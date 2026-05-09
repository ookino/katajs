import type { Hono } from 'hono';
import type {
  ModuleContainer,
  ProvidesMap,
  RequiresList,
  ServiceFactory,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHono = Hono<any, any, any>;

/**
 * A services-only module: defines the registry contributions and dependency
 * graph for a feature, but mounts no HTTP routes. Use for cross-cutting
 * concerns like an `events` recorder or an `audit` logger that other modules
 * fan out into.
 */
export type ServiceOnlyModule<
  Provides extends ProvidesMap = ProvidesMap,
  Requires extends RequiresList = RequiresList,
> = {
  readonly name: string;
  readonly provides: Provides;
  readonly requires: Requires;
};

/**
 * A routed module: services + HTTP routes mounted at a fixed prefix. The
 * routes and prefix are co-required — they always come as a pair.
 */
export type RoutedModule<
  Provides extends ProvidesMap = ProvidesMap,
  Requires extends RequiresList = RequiresList,
  Routes extends AnyHono = AnyHono,
  Prefix extends string = string,
> = ServiceOnlyModule<Provides, Requires> & {
  readonly routes: Routes;
  readonly prefix: Prefix;
};

/** Either kind. Used internally by `createApp` and the boot validation. */
export type Module<
  Provides extends ProvidesMap = ProvidesMap,
  Requires extends RequiresList = RequiresList,
> = ServiceOnlyModule<Provides, Requires> | RoutedModule<Provides, Requires>;

/** Map of service keys to their resolved (return) types. */
type ProvidesReturns<P extends Record<string, unknown>> = {
  readonly [K in keyof P]: ServiceFactory<P[K]>;
};

type DefineSpecBase<
  PReturns extends Record<string, unknown>,
  Requires extends RequiresList,
> = {
  readonly name: string;
  readonly provides: {
    readonly [K in keyof PReturns]: (
      c: ModuleContainer<PReturns, Requires[number]>,
    ) => PReturns[K];
  };
  readonly requires: Requires;
};

/**
 * Declare a feature module. Returns either a `RoutedModule` (when `routes`
 * and `prefix` are provided) or a `ServiceOnlyModule` (when they aren't).
 * The two-overload signature means TypeScript can prove at the type level
 * that `routedModule.routes` is non-optional — no `!` at the call site.
 *
 * DX caveat: in a module with exactly one factory in `provides`,
 * TypeScript's self-referential inference of `PReturns` weakens — `c.resolve`
 * may not reject undeclared keys at compile time inside that lone factory.
 * The runtime boot-time checks (§10) still catch every error.
 */
export function defineModule<
  PReturns extends Record<string, unknown>,
  Requires extends RequiresList,
  Routes extends AnyHono,
  Prefix extends string,
>(
  spec: DefineSpecBase<PReturns, Requires> & {
    readonly routes: Routes;
    readonly prefix: Prefix;
  },
): RoutedModule<ProvidesReturns<PReturns>, Requires, Routes, Prefix>;
export function defineModule<
  PReturns extends Record<string, unknown>,
  Requires extends RequiresList,
>(
  spec: DefineSpecBase<PReturns, Requires>,
): ServiceOnlyModule<ProvidesReturns<PReturns>, Requires>;
export function defineModule(spec: {
  name: string;
  provides: Record<string, unknown>;
  requires: readonly string[];
  routes?: AnyHono;
  prefix?: string;
}): Module {
  if (spec.routes && spec.prefix) {
    return {
      name: spec.name,
      provides: spec.provides as ProvidesMap,
      requires: spec.requires,
      routes: spec.routes,
      prefix: spec.prefix,
    } as RoutedModule;
  }
  return {
    name: spec.name,
    provides: spec.provides as ProvidesMap,
    requires: spec.requires,
  } as ServiceOnlyModule;
}
