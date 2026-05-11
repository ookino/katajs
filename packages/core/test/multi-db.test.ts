import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { containerMiddleware, type DbAdapter } from '../src/middleware';
import { buildRegistry } from '../src/container';
import type { RequestContainer, ServiceFactory } from '../src/types';

type FakeClient = { tag: string };

declare module '../src/types' {
  interface Registry {
    mainRepo: { db: FakeClient };
  }
}

function makeAdapter(tag: string): DbAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    create: () => ({ tag }) as never,
    runTransaction: async (db, fn) => {
      calls.push('tx-begin');
      const txDb: FakeClient = { tag: `${(db as FakeClient).tag}#tx` };
      try {
        const r = await fn(txDb as never);
        calls.push('tx-commit');
        return r;
      } catch (e) {
        calls.push('tx-rollback');
        throw e;
      }
    },
  };
}

function buildApp(
  db: DbAdapter | Record<string, DbAdapter>,
  providers: Record<string, ServiceFactory<unknown>> = {},
) {
  const registry = buildRegistry([providers]);
  const app = new Hono<{ Variables: { container: RequestContainer; requestId: string } }>();
  app.use('*', containerMiddleware({ registry, db }));
  return app;
}

describe('multi-database (db as a named map)', () => {
  it('exposes each named client on c.db.<name>', async () => {
    const app = buildApp({ main: makeAdapter('M'), sessions: makeAdapter('S') });
    app.get('/x', (c) => {
      const db = c.var.container.db as unknown as { main: FakeClient; sessions: FakeClient };
      return c.json({ main: db.main.tag, sessions: db.sessions.tag });
    });
    expect(await (await app.request('/x')).json()).toEqual({ main: 'M', sessions: 'S' });
  });

  it("withTransaction('main', fn) wraps the named adapter; other dbs are untouched", async () => {
    const main = makeAdapter('M');
    const sessions = makeAdapter('S');
    // A repo bound to the `main` db resolves c.db.main (not c.db, which is
    // the whole map in a multi-db app).
    const app = buildApp(
      { main, sessions },
      {
        mainRepo: (c) => ({
          db: ((c as RequestContainer).db as unknown as { main: FakeClient; sessions: FakeClient }).main,
        }),
      },
    );

    let snapshot: { mainInTx: string; sessionsInTx: string; repoDb: string } | null = null;
    app.get('/run', async (c) => {
      await c.var.container.withTransaction('main', async (tx) => {
        const db = tx.db as unknown as { main: FakeClient; sessions: FakeClient };
        const repo = tx.resolve('mainRepo');
        snapshot = {
          mainInTx: db.main.tag,
          sessionsInTx: db.sessions.tag,
          repoDb: (repo.db as unknown as { tag: string }).tag,
        };
      });
      return c.json({ ok: true });
    });

    await app.request('/run');
    expect(snapshot).toEqual({ mainInTx: 'M#tx', sessionsInTx: 'S', repoDb: 'M#tx' });
    expect(main.calls).toEqual(['tx-begin', 'tx-commit']);
    expect(sessions.calls).toEqual([]); // never touched
  });

  it("withTransaction(fn) without a name throws in a multi-db app", async () => {
    const app = buildApp({ main: makeAdapter('M'), sessions: makeAdapter('S') });
    app.get('/x', async (c) => {
      try {
        await c.var.container.withTransaction(async () => {});
        return c.json({ ok: true });
      } catch (e) {
        return c.json({ err: (e as Error).message });
      }
    });
    const { err } = (await (await app.request('/x')).json()) as { err: string };
    expect(err).toMatch(/multiple databases/i);
    expect(err).toMatch(/main, sessions/);
  });

  it('throws on an unknown db name', async () => {
    const app = buildApp({ main: makeAdapter('M') });
    app.get('/x', async (c) => {
      try {
        await c.var.container.withTransaction('nope', async () => {});
        return c.json({ ok: true });
      } catch (e) {
        return c.json({ err: (e as Error).message });
      }
    });
    const { err } = (await (await app.request('/x')).json()) as { err: string };
    expect(err).toMatch(/No database named 'nope'/);
  });

  it("throws an empty-map error when db: {} is passed", async () => {
    const app = buildApp({});
    app.get('/x', async (c) => {
      try {
        // Touching c.var.container builds the bundle → throws.
        void c.var.container;
        return c.json({ ok: true });
      } catch (e) {
        return c.json({ err: (e as Error).message });
      }
    });
    // The throw happens inside the middleware (buildDbBundle). Hono surfaces it.
    const res = await app.request('/x');
    expect(res.status).toBe(500);
  });
});

describe('single-database (db as a bare adapter) — unchanged behaviour', () => {
  it('c.db is the client directly and withTransaction(fn) works', async () => {
    const adapter = makeAdapter('only');
    const app = buildApp(adapter);
    let dbTag = '';
    let txTag = '';
    app.get('/x', async (c) => {
      dbTag = (c.var.container.db as unknown as FakeClient).tag;
      await c.var.container.withTransaction(async (tx) => {
        txTag = (tx.db as unknown as FakeClient).tag;
      });
      return c.json({ ok: true });
    });
    await app.request('/x');
    expect(dbTag).toBe('only');
    expect(txTag).toBe('only#tx');
    expect(adapter.calls).toEqual(['tx-begin', 'tx-commit']);
  });

  it("withTransaction('name', fn) throws in a single-db app", async () => {
    const app = buildApp(makeAdapter('only'));
    app.get('/x', async (c) => {
      try {
        await c.var.container.withTransaction('main', async () => {});
        return c.json({ ok: true });
      } catch (e) {
        return c.json({ err: (e as Error).message });
      }
    });
    const { err } = (await (await app.request('/x')).json()) as { err: string };
    expect(err).toMatch(/single database/i);
  });
});
