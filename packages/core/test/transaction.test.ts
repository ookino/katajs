import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import {
  containerMiddleware,
  type DbAdapter,
} from '../src/middleware';
import { buildRegistry } from '../src/container';
import type { ServiceFactory, RequestContainer } from '../src/types';

type FakeDb = { tag: string };

// Test-scoped Registry augmentation: declares the keys these tests resolve.
declare module '../src/types' {
  interface Registry {
    postRepository: { db: FakeDb };
    greeter: { hi: () => string };
  }
}

function makeFakeAdapter(): DbAdapter & { calls: { kind: string; db?: unknown }[] } {
  const calls: { kind: string; db?: unknown }[] = [];
  let nextId = 0;
  return {
    calls,
    create: () => ({ tag: `db-${++nextId}` }) as never,
    runTransaction: async (db, fn) => {
      calls.push({ kind: 'tx-begin', db });
      const txDb: FakeDb = { tag: `${(db as FakeDb).tag}#tx` };
      try {
        const result = await fn(txDb as never);
        calls.push({ kind: 'tx-commit', db: txDb });
        return result;
      } catch (err) {
        calls.push({ kind: 'tx-rollback', db: txDb });
        throw err;
      }
    },
  };
}

const repoFactory: ServiceFactory<{ db: FakeDb }> = (c) => ({
  db: (c as RequestContainer).db as FakeDb,
});

function buildApp(adapter: DbAdapter, providers: Record<string, ServiceFactory<unknown>> = {}) {
  const registry = buildRegistry([providers]);
  const app = new Hono<{ Variables: { container: RequestContainer; requestId: string } }>();
  app.use('*', containerMiddleware({ registry, db: adapter }));
  return app;
}

describe('container.withTransaction', () => {
  it('invokes the adapter and exposes a sub-container with the tx db', async () => {
    const adapter = makeFakeAdapter();
    const app = buildApp(adapter, { postRepository: repoFactory });

    const seen: Array<{ outer: string; inner: string; repoDb: string }> = [];
    app.get('/run', async (c) => {
      const root = c.var.container;
      await root.withTransaction(async (tx) => {
        const repo = tx.resolve('postRepository');
        seen.push({
          outer: (root.db as FakeDb).tag,
          inner: (tx.db as FakeDb).tag,
          repoDb: repo.db.tag,
        });
      });
      return c.json({ ok: true });
    });

    const res = await app.request('/run');
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ outer: 'db-1', inner: 'db-1#tx', repoDb: 'db-1#tx' }]);
    expect(adapter.calls.map((c) => c.kind)).toEqual(['tx-begin', 'tx-commit']);
  });

  it('rolls back when the callback throws', async () => {
    const adapter = makeFakeAdapter();
    const app = buildApp(adapter);

    app.get('/boom', async (c) => {
      try {
        await c.var.container.withTransaction(async () => {
          throw new Error('boom');
        });
      } catch (e) {
        return c.json({ caught: (e as Error).message });
      }
      return c.json({ caught: null });
    });

    const res = await app.request('/boom');
    expect(await res.json()).toEqual({ caught: 'boom' });
    expect(adapter.calls.map((c) => c.kind)).toEqual(['tx-begin', 'tx-rollback']);
  });

  it('nested withTransaction reuses the outer tx (no savepoints in v0.1)', async () => {
    const adapter = makeFakeAdapter();
    const app = buildApp(adapter);

    const captured: string[] = [];
    app.get('/nest', async (c) => {
      await c.var.container.withTransaction(async (outer) => {
        captured.push((outer.db as FakeDb).tag);
        await outer.withTransaction(async (inner) => {
          captured.push((inner.db as FakeDb).tag);
        });
      });
      return c.json({ ok: true });
    });

    await app.request('/nest');
    expect(captured).toEqual(['db-1#tx', 'db-1#tx']);
    expect(adapter.calls.filter((c) => c.kind === 'tx-begin')).toHaveLength(1);
  });

  it('throws when withTransaction is called without a tx-capable adapter', async () => {
    const adapter: DbAdapter = { create: () => ({ tag: 'db' }) as never };
    const app = buildApp(adapter);

    app.get('/run', async (c) => {
      try {
        await c.var.container.withTransaction(async () => {});
        return c.json({ ok: true });
      } catch (e) {
        return c.json({ err: (e as Error).message });
      }
    });

    const res = await app.request('/run');
    expect(((await res.json()) as { err: string }).err).toMatch(/does not support transactions/);
  });

  it('caches per-tx resolves: same key resolves to the same instance', async () => {
    const adapter = makeFakeAdapter();
    const factory = vi.fn(repoFactory);
    const app = buildApp(adapter, { postRepository: factory });

    let firstRef: unknown;
    let secondRef: unknown;

    app.get('/cache', async (c) => {
      await c.var.container.withTransaction(async (tx) => {
        firstRef = tx.resolve('postRepository');
        secondRef = tx.resolve('postRepository');
      });
      return c.json({ ok: true });
    });

    await app.request('/cache');
    expect(firstRef).toBe(secondRef);
    expect((firstRef as { db: FakeDb }).db.tag).toBe('db-1#tx');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('containerMiddleware', () => {
  it('writes the X-Request-Id header and uses the provided generator', async () => {
    const adapter: DbAdapter = { create: () => ({ tag: 'db' }) as never };
    const registry = buildRegistry([]);
    const app = new Hono<{ Variables: { container: RequestContainer; requestId: string } }>();
    app.use(
      '*',
      containerMiddleware({ registry, db: adapter, generateRequestId: () => 'req_fixed' }),
    );
    app.get('/x', (c) => c.json({ id: c.var.requestId }));

    const res = await app.request('/x');
    expect(res.headers.get('x-request-id')).toBe('req_fixed');
    expect(await res.json()).toEqual({ id: 'req_fixed' });
  });

  it('makes c.var.container.resolve available to handlers', async () => {
    const adapter: DbAdapter = { create: () => ({ tag: 'db' }) as never };
    const registry = buildRegistry([{ greeter: () => ({ hi: () => 'hello' }) }]);
    const app = new Hono<{ Variables: { container: RequestContainer; requestId: string } }>();
    app.use('*', containerMiddleware({ registry, db: adapter }));
    app.get('/hi', (c) => {
      const greeter = c.var.container.resolve('greeter');
      return c.json({ msg: greeter.hi() });
    });

    const res = await app.request('/hi');
    expect(await res.json()).toEqual({ msg: 'hello' });
  });
});
