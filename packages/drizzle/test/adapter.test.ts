import { describe, expect, it, vi } from 'vitest';
import { drizzleAdapter } from '../src/adapter';

describe('drizzleAdapter.create', () => {
  it('uses makeClient when provided (test-friendly path)', () => {
    const fake = { tag: 'fake-drizzle' };
    const adapter = drizzleAdapter({
      makeClient: () => fake as never,
    });
    const client = adapter.create({});
    expect(client).toBe(fake);
  });

  it('throws a clear error when the HYPERDRIVE binding is missing', () => {
    const adapter = drizzleAdapter();
    expect(() => adapter.create({})).toThrowError(
      /Missing 'HYPERDRIVE' binding or its connectionString/,
    );
  });

  it('honours a custom bindingName', () => {
    const fake = { tag: 'fake' };
    const adapter = drizzleAdapter({
      bindingName: 'PG',
      makeClient: () => fake as never,
    });
    expect(adapter.create({ PG: { connectionString: 'ignored-because-makeClient' } })).toBe(
      fake,
    );
  });
});

describe('drizzleAdapter.runTransaction', () => {
  it('delegates to db.transaction(fn) with the txDb', async () => {
    const txHandle = { tag: 'tx' };
    const transaction = vi.fn(
      async (cb: (tx: typeof txHandle) => Promise<unknown>) => cb(txHandle),
    );
    const fakeDb = { transaction } as never;

    const adapter = drizzleAdapter({ makeClient: () => fakeDb });

    const result = await adapter.runTransaction(fakeDb, async (tx) => {
      return { receivedTag: (tx as unknown as typeof txHandle).tag };
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ receivedTag: 'tx' });
  });

  it('propagates errors so the outer Drizzle transaction rolls back', async () => {
    const transaction = vi.fn(
      async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
    );
    const fakeDb = { transaction } as never;

    const adapter = drizzleAdapter({ makeClient: () => fakeDb });

    await expect(
      adapter.runTransaction(fakeDb, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
