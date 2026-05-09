import type { ProvidesMap, ServiceFactory } from './types';

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
