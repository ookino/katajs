import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createApp } from '../src/app';
import { defineModule } from '../src/module';
import { AppError } from '../src/errors';
import type { DbAdapter } from '../src/middleware';
import type { RequestContainer } from '../src/types';

// Test-scoped Registry augmentation: declares the synthetic service keys used
// in the fixtures below. Without this, RequiresList = readonly RegistryKey[]
// would (correctly) reject these made-up keys.
declare module '../src/types' {
  interface Registry {
    aOne: number;
    aTwo: number;
    bOne: number;
    bTwo: number;
    sharedKey: string;
    anchor: number;
    anchorB: number;
    aRepo: object;
    aSvc: object;
  }
}

const noopDb: DbAdapter = { create: () => ({}) as never };

class NotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = 'not_found';
  override readonly publicMessage = 'Not found';
  constructor() {
    super('Not found');
  }
}

describe('createApp boot-time validation', () => {
  it('throws on duplicate provides keys with both module names', () => {
    const a = defineModule({
      name: 'auth',
      provides: { sharedKey: () => 'a', anchor: () => 0 },
      requires: [] as const,
    });
    const b = defineModule({
      name: 'users',
      provides: { sharedKey: () => 'b', anchorB: () => 0 },
      requires: [] as const,
    });

    expect(() => createApp({ db: noopDb, modules: [a, b] })).toThrowError(
      /Duplicate provides key 'sharedKey'\.\s+Provided by: 'auth' and 'users'/,
    );
  });

  it('throws on missing requires with the requiring module + missing key + registered keys', () => {
    const posts = defineModule({
      name: 'posts',
      provides: { postRepository: () => ({}), postService: () => ({}) },
      requires: ['eventRepository'] as const,
    });

    expect(() => createApp({ db: noopDb, modules: [posts] })).toThrowError(
      /Module 'posts' requires 'eventRepository'.*Modules registered: posts.*Provided keys: postRepository, postService/s,
    );
  });

  it('throws on module dependency cycles with the cycle path', () => {
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

    expect(() => createApp({ db: noopDb, modules: [a, b] })).toThrowError(
      /Module dependency cycle detected\.\s+Cycle: a -> b -> a/,
    );
  });

  it('accepts a valid module graph and returns a working Hono app', async () => {
    const events = defineModule({
      name: 'events',
      provides: {
        eventRepository: () => ({ record: vi.fn() }),
        eventService: () => ({}),
      },
      requires: [] as const,
    });
    const posts = defineModule({
      name: 'posts',
      provides: {
        postRepository: () => ({ findById: async () => null }),
        postService: () => ({}),
      },
      requires: ['eventRepository'] as const,
    });

    const { app } = createApp({ db: noopDb, modules: [events, posts] });
    expect(app).toBeInstanceOf(Hono);
  });

  it('mounts module routes at the declared prefix', async () => {
    const postsRoutes = new Hono();
    postsRoutes.get('/', (c) => c.json({ kind: 'list' }));
    postsRoutes.get('/:id', (c) => c.json({ kind: 'one', id: c.req.param('id') }));

    const posts = defineModule({
      name: 'posts',
      provides: {
        postRepository: () => ({}),
        postService: () => ({}),
      },
      requires: [] as const,
      routes: postsRoutes,
      prefix: '/posts',
    });

    const { app: base } = createApp({ db: noopDb, modules: [posts] });
    const app = base.route(posts.prefix, posts.routes);

    const list = await app.request('/posts');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ kind: 'list' });

    const one = await app.request('/posts/abc');
    expect(await one.json()).toEqual({ kind: 'one', id: 'abc' });
  });

  it('wires the error mapper via app.onError so handler throws are caught', async () => {
    const onUnhandled = vi.fn();
    const routes = new Hono();
    routes.get('/', () => {
      throw new NotFoundError();
    });
    routes.get('/boom', () => {
      throw new Error('explosion');
    });

    const m = defineModule({
      name: 'm',
      provides: { aRepo: () => ({}), aSvc: () => ({}) },
      requires: [] as const,
      routes,
      prefix: '/m',
    });

    const { app: base } = createApp({
      db: noopDb,
      modules: [m],
      errorMapper: { onUnhandled },
      generateRequestId: () => 'req_app',
    });
    const app = base.route(m.prefix, m.routes);

    const r1 = await app.request('/m');
    expect(r1.status).toBe(404);
    expect(await r1.json()).toEqual({
      error: 'not_found',
      message: 'Not found',
      requestId: 'req_app',
    });

    const r2 = await app.request('/m/boom');
    expect(r2.status).toBe(500);
    expect(onUnhandled).toHaveBeenCalledTimes(1);
  });

  it('runs user middleware after the container is set up and before route handlers', async () => {
    const seen = vi.fn();
    const routes = new Hono();
    routes.get('/', (c) => c.json({ ok: true }));

    const m = defineModule({
      name: 'm',
      provides: { aRepo: () => ({}), aSvc: () => ({}) },
      requires: [] as const,
      routes,
      prefix: '/m',
    });

    const { app: base } = createApp({
      db: noopDb,
      modules: [m],
      middleware: [
        async (c, next) => {
          const container = c.get('container') as RequestContainer | undefined;
          seen(container?.requestId);
          await next();
        },
      ],
      generateRequestId: () => 'req_mw',
    });
    const app = base.route(m.prefix, m.routes);

    const res = await app.request('/m');
    expect(res.status).toBe(200);
    expect(seen).toHaveBeenCalledWith('req_mw');
  });
});
