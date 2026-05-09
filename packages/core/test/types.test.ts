import { describe, it, expectTypeOf } from 'vitest';
import { Hono } from 'hono';
import { hc } from 'hono/client';
import { z } from 'zod';
import { defineModule } from '../src/module';
import { createApp } from '../src/app';
import type { RequestVariables } from '../src/middleware';
import { validate } from '../src/validate';
import type { DbAdapter } from '../src/middleware';
import type {
  ModuleContainer,
  Registry,
  ResolveOf,
  MergeProvides,
} from '../src/types';

type PostRepo = {
  findById: (id: string) => Promise<{ id: string; title: string } | undefined>;
  insert: (input: { title: string }) => Promise<{ id: string; title: string }>;
};

type PostService = {
  create: (title: string) => Promise<{ id: string; title: string }>;
};

declare module '../src/types' {
  interface Registry {
    eventRepository: { record: (name: string) => Promise<void> };
    authService: { verify: () => Promise<boolean> };
  }
}

describe('defineModule type inference', () => {
  it('infers `requires` as a readonly tuple of literal strings', () => {
    const m = defineModule({
      name: 'posts',
      provides: {},
      requires: ['eventRepository', 'authService'] as const,
    });
    expectTypeOf(m.requires).toEqualTypeOf<readonly ['eventRepository', 'authService']>();
  });

  it('infers `provides` factory return types into the Module shape', () => {
    const m = defineModule({
      name: 'posts',
      provides: {
        postRepository: (): PostRepo => ({
          findById: async () => undefined,
          insert: async (i) => ({ id: '1', title: i.title }),
        }),
      },
      requires: [] as const,
    });

    expectTypeOf<ReturnType<typeof m.provides.postRepository>>().toEqualTypeOf<PostRepo>();
  });

  it('factory `c.resolve` accepts own provides and required keys', () => {
    defineModule({
      name: 'posts',
      provides: {
        postRepository: (): PostRepo => ({
          findById: async () => undefined,
          insert: async (i) => ({ id: '1', title: i.title }),
        }),
        postService: (c): PostService => {
          const repo = c.resolve('postRepository');
          expectTypeOf(repo).toEqualTypeOf<PostRepo>();

          const events = c.resolve('eventRepository');
          expectTypeOf(events).toEqualTypeOf<Registry['eventRepository']>();

          return {
            create: async (title) => repo.insert({ title }),
          };
        },
      },
      requires: ['eventRepository'] as const,
    });
  });

  it('rejects c.resolve on keys not in the augmented Registry (typo-strict)', () => {
    // Strict mode: c.resolve only accepts keys that exist somewhere in the
    // augmented Registry. Typos and totally-fake keys are TS errors, even
    // inside module factories. The narrow overloads (keyof PSelf, RKeys)
    // give specific types for own provides and declared requires; other
    // Registry keys are typed via the inherited fallback.
    defineModule({
      name: 'posts',
      provides: {
        postRepository: (): PostRepo => ({
          findById: async () => undefined,
          insert: async (i) => ({ id: '1', title: i.title }),
        }),
        postService: (c): PostService => {
          // @ts-expect-error 'someServiceThatDoesntExist' is not in the Registry
          c.resolve('someServiceThatDoesntExist');
          // @ts-expect-error a typo is also rejected
          c.resolve('postReposiotry');
          // 'eventRepository' IS in the augmented Registry — compiles even if
          // posts didn't declare it in `requires`. (Trade-off: undeclared
          // cross-module use is caught by runtime boot validation, not by TS.)
          c.resolve('eventRepository');
          return { create: async () => ({ id: '1', title: '' }) };
        },
      },
      requires: ['eventRepository'] as const,
    });
  });

  it('cross-module resolve types via Registry augmentation, falls back to unknown', () => {
    type Augmented = ResolveOf<'eventRepository'>;
    expectTypeOf<Augmented>().toEqualTypeOf<Registry['eventRepository']>();

    type NotAugmented = ResolveOf<'somethingNobodyDeclared'>;
    expectTypeOf<NotAugmented>().toEqualTypeOf<unknown>();
  });

  it('MergeProvides combines provides maps from a tuple of modules', () => {
    const events = defineModule({
      name: 'events',
      provides: {
        eventRepository: () => ({ record: async (_: string) => {} }),
      },
      requires: [] as const,
    });

    const posts = defineModule({
      name: 'posts',
      provides: {
        postRepository: (): PostRepo => ({
          findById: async () => undefined,
          insert: async (i) => ({ id: '1', title: i.title }),
        }),
      },
      requires: ['eventRepository'] as const,
    });

    type Merged = MergeProvides<readonly [typeof events, typeof posts]>;
    expectTypeOf<keyof Merged>().toEqualTypeOf<'eventRepository' | 'postRepository'>();
  });
});

describe('ModuleContainer narrowing', () => {
  it('exposes the base container fields', () => {
    type C = ModuleContainer<{ x: { a: number } }, 'y'>;
    expectTypeOf<C['requestId']>().toEqualTypeOf<string>();
    expectTypeOf<C['resolve']>().toBeFunction();
  });
});

describe('createApp return type carries module route schemas (Hono RPC)', () => {
  const noopDb: DbAdapter = { create: () => ({}) as never };

  const PostBody = z.object({ title: z.string(), body: z.string() });

  const postsRoutes = new Hono()
    .post('/', ...validate({ body: PostBody }), (c) => {
      const data = c.req.valid('json');
      return c.json({ post: { id: '1', ...data } }, 201);
    })
    .get('/:id', (c) => c.json({ post: { id: c.req.param('id'), title: 't', body: 'b' } }));

  const postsModule = defineModule({
    name: 'posts',
    provides: {
      postRepository: () => ({ list: async () => [] }),
      postService: () => ({ greet: () => 'hi' }),
    },
    requires: [] as const,
    routes: postsRoutes,
    prefix: '/posts',
  });

  it('user chains .route() → typeof app carries the merged schema for hc<>', () => {
    const { app: base } = createApp({ db: noopDb, modules: [postsModule] });
    const app = base.route(postsModule.prefix!, postsModule.routes!);
    const client = hc<typeof app>('http://example.com');

    expectTypeOf(client.posts.$post).toBeFunction();
    expectTypeOf(client.posts[':id'].$get).toBeFunction();

    type PostArg = Parameters<typeof client.posts.$post>[0];
    expectTypeOf<PostArg>().toMatchTypeOf<{ json: { title: string; body: string } }>();
  });

  it('multi-module chain composes cleanly', () => {
    const otherRoutes = new Hono<{ Variables: RequestVariables }>().get('/ping', (c) =>
      c.json({ ok: true }),
    );
    const otherModule = defineModule({
      name: 'other',
      provides: { otherSvc: () => ({}) },
      requires: [] as const,
      routes: otherRoutes,
      prefix: '/other',
    });

    const { app: base } = createApp({ db: noopDb, modules: [postsModule, otherModule] });
    const app = base
      .route(postsModule.prefix!, postsModule.routes!)
      .route(otherModule.prefix!, otherModule.routes!);
    const client = hc<typeof app>('http://example.com');

    expectTypeOf(client.posts.$post).toBeFunction();
    expectTypeOf(client.other.ping.$get).toBeFunction();
  });
});
