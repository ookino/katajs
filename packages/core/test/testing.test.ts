import { describe, expect, it, vi } from 'vitest';
import { makeTestContainer } from '../src/testing';

declare module '../src/types' {
  interface Registry {
    fakeService: { greet: (name: string) => string };
    fakeRepo: { count: () => Promise<number> };
  }
}

describe('makeTestContainer', () => {
  it('returns a container that resolves provided services', () => {
    const greet = vi.fn().mockReturnValue('hi alice');
    const c = makeTestContainer({
      services: {
        fakeService: { greet },
      },
    });
    const svc = c.resolve('fakeService');
    expect(svc.greet('alice')).toBe('hi alice');
    expect(greet).toHaveBeenCalledWith('alice');
  });

  it('throws a clear error for unregistered keys', () => {
    const c = makeTestContainer({ services: { fakeService: { greet: () => 'x' } } });
    expect(() => c.resolve('fakeRepo')).toThrowError(
      /No service registered for key 'fakeRepo'.*Currently registered: fakeService/s,
    );
  });

  it('default withTransaction calls fn with the same container (tx becomes a no-op)', async () => {
    const greet = vi.fn().mockReturnValue('ok');
    const c = makeTestContainer({
      services: { fakeService: { greet } },
    });

    let txWasCalled = false;
    const result = await c.withTransaction(async (tx) => {
      txWasCalled = true;
      return tx.resolve('fakeService').greet('inside-tx');
    });

    expect(txWasCalled).toBe(true);
    expect(result).toBe('ok');
    expect(greet).toHaveBeenCalledWith('inside-tx');
  });

  it('honours a custom runTransaction override (e.g. to assert rollback semantics)', async () => {
    const greet = vi.fn();
    const runTransaction = vi.fn(async (fn) => fn(c));
    const c = makeTestContainer({
      services: { fakeService: { greet } },
      runTransaction,
    });

    await c.withTransaction(async (tx) => {
      tx.resolve('fakeService').greet('x');
    });

    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('exposes user-supplied env, db, and requestId', () => {
    const env = { FOO: 'bar' } as never;
    const db = { __mock: true } as never;
    const c = makeTestContainer({
      services: {},
      env,
      db,
      requestId: 'req_unit_42',
    });
    expect(c.env).toBe(env);
    expect(c.db).toBe(db);
    expect(c.requestId).toBe('req_unit_42');
  });
});
