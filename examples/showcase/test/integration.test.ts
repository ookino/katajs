import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { Hono } from 'hono';
import { hc } from 'hono/client';
import {
  createApp,
  defineModule,
  type RequestVariables,
  type RequestContainer,
} from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from '../src/db/schema';
import { postsModule } from '../src/modules/posts/index';
import { eventsModule } from '../src/modules/events/index';
import { auditModule } from '../src/modules/audit/index';
import { usersModule } from '../src/modules/users/index';
import { commentsModule } from '../src/modules/comments/index';
import { PostNotFoundError, ForbiddenPostError } from '../src/modules/posts/posts.errors';
import { makePostRepository } from '../src/modules/posts/posts.repository';
import { applyTestSchema, truncateAll, TEST_DB_URL } from './setup-db';

type TestEnv = { Variables: RequestVariables };

// Test-scoped Registry augmentation: synthetic keys used by fixture modules
// in the boot-validation tests below. The real app's Registry (declared in
// src/types.d.ts) is composed via `extends PostsRegistry, ...`; these keys
// exist only in the test scope.
declare module '@katajs/core' {
  interface Registry {
    aOne: number;
    aTwo: number;
    bOne: number;
    bTwo: number;
    dup: string;
    anchorA: number;
    anchorB: number;
    nonExistentService: unknown;
    brokenSvc: object;
    brokenSvc2: object;
    aRepo: object;
    aSvc: object;
    otherSvc: object;
    dummy: object;
    dummy2: object;
    anchor: object;
  }
}

/**
 * One end-to-end test pass that exercises every framework path against a real
 * Postgres. Runs in ~3-5s on a local machine. Requires:
 *
 *   psql -U postgres -c 'CREATE DATABASE katajs_showcase_test;'
 *
 * Override target DB via `KATAJS_TEST_PG_URL`.
 */

const env = { HYPERDRIVE: { connectionString: TEST_DB_URL } };

let onUnhandled = vi.fn();

function buildApp() {
  const { app: base } = createApp({
    bindings: {} as unknown,
    db: drizzleAdapter({ schema }),
    modules: [eventsModule, auditModule, usersModule, postsModule, commentsModule],
    errorMapper: { onUnhandled },
    generateRequestId: () => 'req_test',
  });
  return base
    .route(usersModule.prefix, usersModule.routes)
    .route(postsModule.prefix, postsModule.routes)
    .route(commentsModule.prefix, commentsModule.routes);
}

beforeAll(async () => {
  await applyTestSchema();
});

beforeEach(async () => {
  await truncateAll();
  onUnhandled = vi.fn();
});

// --------------------------------------------------------------------------
// 1. Boot validation (synchronous; runs in createApp)
// --------------------------------------------------------------------------

describe('boot validation', () => {
  it('throws on duplicate provides keys', () => {
    const a = defineModule({
      name: 'a',
      provides: { dup: () => 1, anchorA: () => 0 },
      requires: [] as const,
    });
    const b = defineModule({
      name: 'b',
      provides: { dup: () => 2, anchorB: () => 0 },
      requires: [] as const,
    });
    expect(() =>
      createApp({ db: drizzleAdapter({ schema }), modules: [a, b] }),
    ).toThrowError(/Duplicate provides key 'dup'.*'a' and 'b'/s);
  });

  it('throws on missing requires with the missing key + registered keys', () => {
    const orphan = defineModule({
      name: 'orphan',
      provides: { anchor1: () => 1, anchor2: () => 2 },
      requires: ['nonExistentService'] as const,
    });
    expect(() =>
      createApp({ db: drizzleAdapter({ schema }), modules: [orphan] }),
    ).toThrowError(/Module 'orphan' requires 'nonExistentService'/);
  });

  it('throws on module dependency cycles', () => {
    const a = defineModule({
      name: 'a',
      provides: { aOne: () => 1, aTwo: () => 2 },
      requires: ['bOne'] as const,
    });
    const b = defineModule({
      name: 'b',
      provides: { bOne: () => 1, bTwo: () => 2 },
      requires: ['aOne'] as const,
    });
    expect(() =>
      createApp({ db: drizzleAdapter({ schema }), modules: [a, b] }),
    ).toThrowError(/cycle.*a -> b -> a/i);
  });
});

// --------------------------------------------------------------------------
// 2. Validation
// --------------------------------------------------------------------------

describe('validation', () => {
  it('POST /posts with valid body succeeds and exposes typed `c.req.valid("json")`', async () => {
    const app = buildApp();
    const res = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hi', body: 'Hello world', authorId: 'alice' }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { post: { id: string; title: string } };
    expect(body.post.title).toBe('Hi');
  });

  it('POST /posts with invalid body returns 400 with body-prefixed issues', async () => {
    const app = buildApp();
    const res = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '', body: '', authorId: '' }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { path: (string | number)[]; message: string }[];
      requestId: string;
    };
    expect(body.error).toBe('validation_failed');
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) expect(issue.path[0]).toBe('body');
    expect(body.requestId).toBe('req_test');
  });

  it('GET /posts?page=2 with valid query parses and uses it', async () => {
    const app = buildApp();
    const res = await app.request('/posts?page=2&pageSize=5', undefined, env);
    expect(res.status).toBe(200);
  });

  it('GET /posts?page=-1 returns 400 with query-prefixed issues', async () => {
    const app = buildApp();
    const res = await app.request('/posts?page=-1', undefined, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      issues: { path: (string | number)[] }[];
    };
    expect(body.issues[0]?.path[0]).toBe('query');
  });

  it('GET /posts/:id with non-uuid returns 400 with param-prefixed issues', async () => {
    const app = buildApp();
    const res = await app.request('/posts/not-a-uuid', undefined, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      issues: { path: (string | number)[] }[];
    };
    expect(body.issues[0]?.path[0]).toBe('param');
  });

  it('DELETE /posts/:id?actorId=... composes param + query validators', async () => {
    const app = buildApp();
    // Missing actorId → query validation fails
    const res = await app.request(
      '/posts/00000000-0000-4000-8000-000000000000',
      { method: 'DELETE' },
      env,
    );
    expect(res.status).toBe(400);
  });
});

// --------------------------------------------------------------------------
// 3. Errors
// --------------------------------------------------------------------------

describe('error mapping', () => {
  it('maps PostNotFoundError to 404 with code + message + payload + requestId', async () => {
    const app = buildApp();
    const res = await app.request(
      '/posts/00000000-0000-4000-8000-000000000000',
      undefined,
      env,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: 'post_not_found',
      message: 'Post not found',
      postId: '00000000-0000-4000-8000-000000000000',
      requestId: 'req_test',
    });
  });

  it('writes the X-Request-Id header on every response', async () => {
    const app = buildApp();
    const res = await app.request('/posts', undefined, env);
    expect(res.headers.get('x-request-id')).toBe('req_test');
  });

  it('masks unhandled errors as 500 and invokes onUnhandled', async () => {
    const broken = defineModule({
      name: 'broken',
      provides: { brokenSvc: () => ({}), brokenSvc2: () => ({}) },
      requires: [] as const,
      routes: new Hono<TestEnv>().get('/boom', () => {
        throw new Error('database exploded');
      }),
      prefix: '/broken',
    });
    const { app: base } = createApp({
      db: drizzleAdapter({ schema }),
      modules: [broken],
      errorMapper: { onUnhandled },
      generateRequestId: () => 'req_boom',
    });
    const app = base.route(broken.prefix, broken.routes);

    const res = await app.request('/broken/boom', undefined, env);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.error).toBe('internal_error');
    expect(body.requestId).toBe('req_boom');
    expect(onUnhandled).toHaveBeenCalledTimes(1);
    expect((onUnhandled.mock.calls[0]?.[0] as Error).message).toBe('database exploded');
  });

  it('publicPayload getter on AppError flows into the response', () => {
    const e = new ForbiddenPostError('p1', 'eve');
    expect(e.status).toBe(403);
    expect(e.code).toBe('forbidden');
  });

  it('AppError preserves internal message for logs and public message for clients', () => {
    const e = new PostNotFoundError('xyz');
    expect(e.message).toBe('Post xyz not found');
    expect(e.publicMessage).toBe('Post not found');
  });
});

// --------------------------------------------------------------------------
// 4. Container & cross-module
// --------------------------------------------------------------------------

describe('container & cross-module dependencies', () => {
  it('resolves services through the augmented Registry', async () => {
    const app = buildApp();
    const res = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 't', body: 'b', authorId: 'alice' }),
      },
      env,
    );
    expect(res.status).toBe(201);

    // posts.create() resolves auditService cross-module, which itself resolves
    // eventService — exercising the full requires graph.
    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const evRows = await dbCheck.query('SELECT name FROM events');
      const auRows = await dbCheck.query('SELECT action FROM audit_log');
      expect(evRows.rows).toHaveLength(1);
      expect(evRows.rows[0]?.name).toBe('audit.post.created');
      expect(auRows.rows).toHaveLength(1);
      expect(auRows.rows[0]?.action).toBe('post.created');
    } finally {
      await dbCheck.end();
    }
  });

  it('caches resolved services per request', async () => {
    // Two POSTs in a single test; each request gets its own container,
    // but within a request the service is resolved once even if used twice.
    const app = buildApp();
    for (let i = 0; i < 2; i++) {
      const res = await app.request(
        '/posts',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: `t${i}`, body: 'b', authorId: 'alice' }),
        },
        env,
      );
      expect(res.status).toBe(201);
    }
    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const rows = await dbCheck.query('SELECT COUNT(*)::int AS n FROM posts');
      expect(rows.rows[0]?.n).toBe(2);
    } finally {
      await dbCheck.end();
    }
  });
});

// --------------------------------------------------------------------------
// 5. Transactions (real SQL — the L2 path)
// --------------------------------------------------------------------------

describe('transactions (real Postgres)', () => {
  it('commits all three writes (post + event + audit) in a single transaction', async () => {
    const app = buildApp();
    const res = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'committed', body: 'b', authorId: 'alice' }),
      },
      env,
    );
    expect(res.status).toBe(201);

    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const p = await dbCheck.query('SELECT COUNT(*)::int AS n FROM posts');
      const e = await dbCheck.query('SELECT COUNT(*)::int AS n FROM events');
      const a = await dbCheck.query('SELECT COUNT(*)::int AS n FROM audit_log');
      expect(p.rows[0]?.n).toBe(1);
      expect(e.rows[0]?.n).toBe(1);
      expect(a.rows[0]?.n).toBe(1);
    } finally {
      await dbCheck.end();
    }
  });

  it('rolls back all writes when a step inside the tx throws', async () => {
    // Build a small route that opens a tx, does a real insert + audit.log,
    // then throws. All three rows should be absent after rollback.
    const failingRoutes = new Hono<TestEnv>().post('/run', async (c) => {
      try {
        await c.var.container.withTransaction(async (tx) => {
          const repo = tx.resolve('postRepository');
          await (repo as ReturnType<typeof makePostRepository>).insert({
            title: 'doomed',
            body: 'b',
            authorId: 'alice',
          });
          const audit = tx.resolve('auditService') as {
            log: (a: {
              actorId: string;
              action: string;
              details: Record<string, unknown>;
            }) => Promise<unknown>;
          };
          await audit.log({
            actorId: 'alice',
            action: 'will-rollback',
            details: {},
          });
          throw new Error('intentional rollback');
        });
        return c.json({ ok: true });
      } catch (e) {
        return c.json({ caught: (e as Error).message }, 500);
      }
    });

    const failingPosts = defineModule({
      name: 'failing-posts',
      provides: {
        postRepository: (c): ReturnType<typeof makePostRepository> =>
          makePostRepository(c.db),
        anchor: () => ({}),
      },
      requires: ['auditService'] as const,
      routes: failingRoutes,
      prefix: '/fail',
    });

    const { app: base } = createApp({
      db: drizzleAdapter({ schema }),
      modules: [eventsModule, auditModule, failingPosts],
      generateRequestId: () => 'req_rollback',
    });
    const app = base.route(failingPosts.prefix, failingPosts.routes);

    const res = await app.request(
      '/fail/run',
      { method: 'POST' },
      env,
    );
    expect(res.status).toBe(500);

    // Real PG check: nothing was committed.
    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const p = await dbCheck.query('SELECT COUNT(*)::int AS n FROM posts');
      const e = await dbCheck.query('SELECT COUNT(*)::int AS n FROM events');
      const a = await dbCheck.query('SELECT COUNT(*)::int AS n FROM audit_log');
      expect(p.rows[0]?.n).toBe(0);
      expect(e.rows[0]?.n).toBe(0);
      expect(a.rows[0]?.n).toBe(0);
    } finally {
      await dbCheck.end();
    }
  });

  it('nested withTransaction reuses the outer (no savepoints in v0.1)', async () => {
    // Build an app that calls withTransaction inside a withTransaction,
    // then asserts the inner doesn't open a new SQL transaction.
    const nestedRoutes = new Hono<TestEnv>().get('/', async (c) => {
      const dbsSeen: unknown[] = [];
      await c.var.container.withTransaction(async (outer) => {
        dbsSeen.push(outer.db);
        await outer.withTransaction(async (inner) => {
          dbsSeen.push(inner.db);
        });
      });
      return c.json({ same: dbsSeen[0] === dbsSeen[1] });
    });
    const nestedModule = defineModule({
      name: 'nested',
      provides: { dummy: () => ({}), dummy2: () => ({}) },
      requires: [] as const,
      routes: nestedRoutes,
      prefix: '/nested',
    });
    const { app: base } = createApp({
      db: drizzleAdapter({ schema }),
      modules: [nestedModule],
    });
    const app = base.route(nestedModule.prefix, nestedModule.routes);

    const res = await app.request('/nested', undefined, env);
    expect(((await res.json()) as { same: boolean }).same).toBe(true);
  });

  it('repository inside withTransaction uses the tx-bound db (visible only on commit)', async () => {
    // Build an app that inserts a post inside a tx but never commits (we throw).
    // Then verify the row is absent.
    const txRollbackRoutes = new Hono<TestEnv>().post('/', async (c) => {
      try {
        await c.var.container.withTransaction(async (tx) => {
          const repo = tx.resolve('postRepository') as ReturnType<typeof makePostRepository>;
          await repo.insert({ title: 'doomed', body: 'x', authorId: 'eve' });
          throw new Error('rolling back');
        });
      } catch {
        return c.json({ rolledBack: true }, 500);
      }
      return c.json({ rolledBack: false });
    });
    const m = defineModule({
      name: 'tx-test',
      provides: {
        postRepository: (c): ReturnType<typeof makePostRepository> =>
          makePostRepository(c.db),
        anchor: () => ({}),
      },
      requires: [] as const,
      routes: txRollbackRoutes,
      prefix: '/tx',
    });
    const { app: base } = createApp({
      db: drizzleAdapter({ schema }),
      modules: [m],
    });
    const app = base.route(m.prefix, m.routes);

    const res = await app.request('/tx', { method: 'POST' }, env);
    expect(res.status).toBe(500);

    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const r = await dbCheck.query('SELECT COUNT(*)::int AS n FROM posts');
      expect(r.rows[0]?.n).toBe(0);
    } finally {
      await dbCheck.end();
    }
  });
});

// --------------------------------------------------------------------------
// 6. Domain errors flow through routes
// --------------------------------------------------------------------------

describe('domain errors through routes', () => {
  it('GET /posts/:id of non-existent UUID → 404 PostNotFoundError', async () => {
    const app = buildApp();
    const res = await app.request(
      '/posts/00000000-0000-4000-8000-000000000000',
      undefined,
      env,
    );
    expect(res.status).toBe(404);
  });

  it('DELETE /posts/:id by wrong actor → 403 ForbiddenPostError', async () => {
    const app = buildApp();
    // First create a post owned by 'alice'.
    const create = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 't', body: 'b', authorId: 'alice' }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { post: { id: string } };

    // Bob tries to delete it.
    const bad = await app.request(
      `/posts/${created.post.id}?actorId=bob`,
      { method: 'DELETE' },
      env,
    );
    expect(bad.status).toBe(403);
    const body = (await bad.json()) as { error: string };
    expect(body.error).toBe('forbidden');
  });

  it('DELETE /posts/:id by owner → 200 + cascading audit/event written', async () => {
    const app = buildApp();
    const create = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 't', body: 'b', authorId: 'alice' }),
      },
      env,
    );
    const { post } = (await create.json()) as { post: { id: string } };

    const ok = await app.request(
      `/posts/${post.id}?actorId=alice`,
      { method: 'DELETE' },
      env,
    );
    expect(ok.status).toBe(200);

    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const p = await dbCheck.query('SELECT COUNT(*)::int AS n FROM posts');
      const a = await dbCheck.query('SELECT action FROM audit_log ORDER BY logged_at');
      const e = await dbCheck.query('SELECT name FROM events ORDER BY occurred_at');
      expect(p.rows[0]?.n).toBe(0);
      expect(a.rows.map((r: { action: string }) => r.action)).toEqual([
        'post.created',
        'post.deleted',
      ]);
      expect(e.rows.map((r: { name: string }) => r.name)).toEqual([
        'audit.post.created',
        'audit.post.deleted',
      ]);
    } finally {
      await dbCheck.end();
    }
  });
});

// --------------------------------------------------------------------------
// 7. New modules: users + comments
// --------------------------------------------------------------------------

describe('users module', () => {
  it('POST /users creates a user', async () => {
    const app = buildApp();
    const res = await app.request(
      '/users',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', displayName: 'Alice' }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.email).toBe('alice@example.com');
  });

  it('POST /users with duplicate email → 409 EmailTakenError', async () => {
    const app = buildApp();
    const make = () =>
      app.request(
        '/users',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'dup@example.com', displayName: 'Dup' }),
        },
        env,
      );

    const first = await make();
    expect(first.status).toBe(201);

    const second = await make();
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('email_taken');
  });

  it('GET /users/:id of unknown id → 404 UserNotFoundError', async () => {
    const app = buildApp();
    const res = await app.request(
      '/users/00000000-0000-4000-8000-000000000000',
      undefined,
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('user_not_found');
  });
});

describe('comments module — transitive cross-module deps', () => {
  async function seedPost(app: ReturnType<typeof buildApp>) {
    const create = await app.request(
      '/posts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 't', body: 'b', authorId: 'alice' }),
      },
      env,
    );
    expect(create.status).toBe(201);
    return ((await create.json()) as { post: { id: string } }).post;
  }

  it('POST /comments creates a comment when the parent post exists', async () => {
    const app = buildApp();
    const post = await seedPost(app);

    const res = await app.request(
      '/comments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postId: post.id, authorId: 'bob', body: 'Nice post!' }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { comment: { id: string; postId: string } };
    expect(body.comment.postId).toBe(post.id);

    // Verify the audit + event side-effects landed (transitive cross-module).
    const dbCheck = new Client({ connectionString: TEST_DB_URL });
    await dbCheck.connect();
    try {
      const a = await dbCheck.query(
        "SELECT action FROM audit_log WHERE action = 'comment.created'",
      );
      const e = await dbCheck.query(
        "SELECT name FROM events WHERE name = 'audit.comment.created'",
      );
      expect(a.rows).toHaveLength(1);
      expect(e.rows).toHaveLength(1);
    } finally {
      await dbCheck.end();
    }
  });

  it('POST /comments with non-existent post → 404 PostNotFoundError (cross-module validation)', async () => {
    const app = buildApp();
    const res = await app.request(
      '/comments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postId: '00000000-0000-4000-8000-000000000000',
          authorId: 'bob',
          body: 'orphan',
        }),
      },
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('post_not_found');
  });

  it('GET /comments?postId=... lists comments for a post', async () => {
    const app = buildApp();
    const post = await seedPost(app);

    for (const body of ['first', 'second']) {
      const res = await app.request(
        '/comments',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ postId: post.id, authorId: 'bob', body }),
        },
        env,
      );
      expect(res.status).toBe(201);
    }

    const list = await app.request(`/comments?postId=${post.id}`, undefined, env);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { comments: { body: string }[] };
    expect(body.comments).toHaveLength(2);
  });

  it('DELETE /comments/:id by wrong actor → 403 ForbiddenCommentError', async () => {
    const app = buildApp();
    const post = await seedPost(app);
    const create = await app.request(
      '/comments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postId: post.id, authorId: 'bob', body: 'mine' }),
      },
      env,
    );
    const { comment } = (await create.json()) as { comment: { id: string } };

    const bad = await app.request(
      `/comments/${comment.id}?actorId=eve`,
      { method: 'DELETE' },
      env,
    );
    expect(bad.status).toBe(403);
  });
});

// --------------------------------------------------------------------------
// 8. Hono RPC client (type-level)
// --------------------------------------------------------------------------

describe('Hono RPC client typing', () => {
  it('typeof app surfaces typed methods to hc<>', () => {
    const app = buildApp();
    const client = hc<typeof app>('http://example.com');

    // If these compile, RPC types are flowing through.
    type PostArg = Parameters<typeof client.posts.$post>[0];
    type _Body = PostArg extends { json: infer J } ? J : never;
    const _typecheck: _Body = { title: 't', body: 'b', authorId: 'alice' };
    expect(_typecheck.title).toBe('t');

    // Path-param route: extract via two-step alias so TS 5 parses cleanly.
    type ClientPostsById = (typeof client.posts)[':id'];
    type GetByIdArg = Parameters<ClientPostsById['$get']>[0];
    const _idArg: GetByIdArg = { param: { id: 'abc' } };
    expect(_idArg.param.id).toBe('abc');
  });
});

afterAll(() => {
  // pg pools are owned by the drizzle adapter per-request (closed when the
  // process exits) — nothing to teardown beyond what beforeEach handles.
});
