import { describe, expect, it, vi } from 'vitest';
import { drizzleMysqlAdapter } from '../src/mysql';

describe('drizzleMysqlAdapter.create', () => {
  it('uses makeClient when provided (test-friendly path)', () => {
    const fake = { tag: 'fake-mysql-drizzle' };
    const adapter = drizzleMysqlAdapter({ makeClient: () => fake as never });
    expect(adapter.create({})).toBe(fake);
  });

  it('throws a clear error when the HYPERDRIVE binding is missing', () => {
    const adapter = drizzleMysqlAdapter();
    expect(() => adapter.create({})).toThrowError(
      /Missing 'HYPERDRIVE' binding or its connectionString/,
    );
  });

  it('honours a custom bindingName', () => {
    const fake = { tag: 'fake' };
    const adapter = drizzleMysqlAdapter({
      bindingName: 'LEGACY_HD',
      makeClient: () => fake as never,
    });
    expect(
      adapter.create({ LEGACY_HD: { connectionString: 'ignored-because-makeClient' } }),
    ).toBe(fake);
  });
});

describe('drizzleMysqlAdapter.runTransaction', () => {
  it('delegates to db.transaction(fn) with the txDb', async () => {
    const txHandle = { tag: 'mysql-tx' };
    const transaction = vi.fn(
      async (cb: (tx: typeof txHandle) => Promise<unknown>) => cb(txHandle),
    );
    const fakeDb = { transaction } as never;
    const adapter = drizzleMysqlAdapter({ makeClient: () => fakeDb });

    const result = await adapter.runTransaction(fakeDb, async (tx) => ({
      receivedTag: (tx as unknown as typeof txHandle).tag,
    }));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ receivedTag: 'mysql-tx' });
  });

  it('propagates errors so the outer Drizzle transaction rolls back', async () => {
    const transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({}));
    const fakeDb = { transaction } as never;
    const adapter = drizzleMysqlAdapter({ makeClient: () => fakeDb });

    await expect(
      adapter.runTransaction(fakeDb, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
