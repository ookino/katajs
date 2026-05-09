import { describe, it, expect, vi } from 'vitest';
import { buildRegistry, makeResolver } from '../src/container';
import type { ServiceFactory } from '../src/types';

describe('makeResolver', () => {
  it('constructs on first call and caches for subsequent calls', () => {
    const factory = vi.fn(() => ({ value: 'created' }));
    const registry = new Map<string, ServiceFactory<unknown>>([['svc', factory]]);
    const resolve = makeResolver(registry, {});

    const a = resolve('svc');
    const b = resolve('svc');

    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('passes the container view to the factory', () => {
    const containerView = { tag: 'container' };
    const factory = vi.fn((c) => c);
    const registry = new Map<string, ServiceFactory<unknown>>([['svc', factory]]);
    const resolve = makeResolver(registry, containerView);

    const result = resolve('svc');
    expect(result).toBe(containerView);
    expect(factory).toHaveBeenCalledWith(containerView);
  });

  it('throws on missing key with the registered keys listed', () => {
    const registry = new Map<string, ServiceFactory<unknown>>([
      ['alpha', () => 1],
      ['beta', () => 2],
    ]);
    const resolve = makeResolver(registry, {});

    expect(() => resolve('gamma')).toThrowError(
      /No service registered for key 'gamma'\. Registered keys: alpha, beta/,
    );
  });

  it('throws on missing key when the registry is empty', () => {
    const resolve = makeResolver(new Map(), {});
    expect(() => resolve('anything')).toThrowError(/Registered keys: \(none\)/);
  });

  it('detects circular dependencies and reports the resolution stack', () => {
    let resolve!: (k: string) => unknown;
    const registry = new Map<string, ServiceFactory<unknown>>([
      ['a', () => resolve('b')],
      ['b', () => resolve('c')],
      ['c', () => resolve('a')],
    ]);
    resolve = makeResolver(registry, {});

    expect(() => resolve('a')).toThrowError(
      /Circular dependency detected while resolving 'a'\. Resolution stack: a -> b -> c -> a/,
    );
  });
});

describe('buildRegistry', () => {
  it('flattens multiple provides maps in declaration order', () => {
    const fA: ServiceFactory<number> = () => 1;
    const fB: ServiceFactory<number> = () => 2;
    const fC: ServiceFactory<number> = () => 3;

    const registry = buildRegistry([
      { a: fA, b: fB },
      { c: fC },
    ]);

    expect(registry.get('a')).toBe(fA);
    expect(registry.get('b')).toBe(fB);
    expect(registry.get('c')).toBe(fC);
    expect(registry.size).toBe(3);
  });
});
