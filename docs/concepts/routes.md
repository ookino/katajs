# Routes

Every route in a katajs app is a Hono route. The framework's job is to mount them in a way that preserves Hono's RPC types end-to-end while keeping the wiring explicit.

## Where routes live

Two places:

1. **Inside a module** — `routes` field on a `RoutedModule`. Mounted at `prefix`.
2. **Free-floating in `createApp`** — for things that don't belong to any module (`/health`, webhooks, OpenAPI spec, etc.).

## Module routes

```ts
// src/modules/posts/posts.routes.ts
import { Hono } from 'hono';
import { validate } from '@katajs/core';
import type { AppEnv } from '../../app';
import { CreatePostSchema, PostIdParam } from './posts.schema';

export const postsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const items = await c.var.resolve('postService').list();
    return c.json({ posts: items });
  })
  .get('/:id', ...validate({ param: PostIdParam }), async (c) => {
    const { id } = c.req.valid('param');
    const post = await c.var.resolve('postService').getById(id);
    return c.json({ post });
  })
  .post('/', ...validate({ body: CreatePostSchema }), async (c) => {
    const input = c.req.valid('json');
    const post = await c.var.resolve('postService').create(input);
    return c.json({ post }, 201);
  });
```

Two things to notice:

- `new Hono<AppEnv>()` — the `AppEnv` type carries `Bindings` and `Variables`. `Variables` is `RequestVariables` from `@katajs/core` (which is what gives you `c.var.resolve`, `c.var.container`, etc.).
- The route chain is **not split into intermediate variables**. Each `.get(...)` returns a more-specific Hono type; chaining preserves that for RPC. If you split out intermediate `app = app.get(...)`, you lose the type information.

The module wraps its routes:

```ts
// src/modules/posts/index.ts
export const postsModule = defineModule({
  name: 'posts',
  provides: { /* ... */ },
  requires: [/* ... */] as const,
  routes: postsRoutes,  // ← mount target
  prefix: '/posts',     // ← mount path
});
```

## One routes file per module — by convention

Every routed module ships a single `<module>.routes.ts` file. `katajs add route` appends to that file; nothing in the CLI or templates supports multiple route files per module by default. This is intentional, the same way [flat module internals are intentional](./modules.md#module-internal-layout-is-flat).

If a module's routes file is approaching unwieldy size (~200 lines and counting), the framework's preferred refactor is to **split into a sibling module at a sub-prefix**, not to split the routes file:

```ts
// Instead of one bloated `posts/posts.routes.ts` with public + admin routes,
// make two modules:

const postsModule = defineModule({
  name: 'posts',
  prefix: '/posts',
  routes: postsRoutes,           // public-facing routes only
  // ...
});

const postsAdminModule = defineModule({
  name: 'posts-admin',
  prefix: '/posts/admin',
  routes: postsAdminRoutes,      // admin-only routes
  requires: ['postService'] as const,  // shares business logic
  // ...
});
```

Why splitting beats nesting routes files:

- **Visible cross-module dependencies.** `postsAdminModule.requires: ['postService']` is right there in the source. With one big module that imports two route files, the relationship is implicit.
- **Separate entries in the devtools graph.** `inspectModules()` shows two nodes, two prefixes, two route lists.
- **Independent middleware.** Each module's routes file owns its own `.use()` chain — no need for path-prefix middleware to scope auth to admin routes.

### The escape hatch: Hono sub-apps

If you genuinely want to split the routes inside one module — the framework doesn't fight you. Hono natively supports composing sub-apps via `.route(path, subApp)`:

```ts
// posts/posts.public.routes.ts
export const publicPostsRoutes = new Hono<AppEnv>()
  .get('/', listHandler)
  .get('/:id', getHandler);

// posts/posts.admin.routes.ts
export const adminPostsRoutes = new Hono<AppEnv>()
  .post('/feature', featureHandler)
  .delete('/:id', adminDeleteHandler);

// posts/posts.routes.ts (the file `index.ts` imports)
import { publicPostsRoutes } from './posts.public.routes';
import { adminPostsRoutes } from './posts.admin.routes';

export const postsRoutes = new Hono<AppEnv>()
  .route('/', publicPostsRoutes)
  .route('/admin', adminPostsRoutes);
```

The runtime treats this identically to a single chained file. RPC types still flow correctly. `katajs add route` won't know to target `posts.admin.routes.ts` — you'd add admin routes by hand. That's the cost of stepping off the convention.

## The `routes` callback in `createApp`

`createApp` accepts a `routes` callback that receives the base `Hono` app and returns the chained app:

```ts
// src/app.ts
const { app } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [eventsModule, auditModule, postsModule, commentsModule],
  routes: (base) =>
    base
      .get('/health', (c) =>
        c.json({ ok: true, requestId: c.var.requestId }),
      )
      .route(usersModule.prefix, usersModule.routes)
      .route(postsModule.prefix, postsModule.routes)
      .route(commentsModule.prefix, commentsModule.routes),
});

export default app;
export type AppType = typeof app;
```

Why a callback instead of "just declare modules and the framework mounts them"? Because **Hono's RPC type inference depends on the literal call chain**. If `createApp` mounted modules internally via a runtime loop, the resulting `app` type would lose all route information and `hc<AppType>()` would return `unknown`.

The callback is the trade: you write one explicit `.route()` call per module, but in exchange you keep full RPC types end-to-end.

## Free-floating routes

Anything you can do with a Hono instance is fair game inside the `routes` callback before or after the module mounts:

```ts
routes: (base) =>
  base
    .get('/health', (c) => c.json({ ok: true }))
    .get('/version', (c) => c.json({ version: '1.0.0' }))
    .post('/webhooks/stripe', stripeWebhookHandler)
    .route(postsModule.prefix, postsModule.routes),
```

Common cases:

- `/health` and `/ready` probes.
- `/version` and `/__build` introspection.
- Webhooks where the route doesn't fit a module (or you want to keep webhook secrets isolated).
- OpenAPI spec mount (`@katajs/openapi` in v0.3).

## RPC clients

```ts
// src/app.ts
export type AppType = typeof app;
```

```ts
// in a TanStack Start app, or any TS client
import { hc } from 'hono/client';
import type { AppType } from '../api/src/app';

const client = hc<AppType>('https://api.example.com');

const res = await client.posts.$post({
  json: { title: 'hi', body: '...' },
});
const data = await res.json();  // typed!
```

Routes mounted via `.route(prefix, subApp)` flow into the parent type, so `client.posts.$post(...)` is fully typed. Validators wired through `validate({ body: ... })` flow Zod-inferred input types into the client.

## Middleware

Three places to register middleware:

### 1. Global, before module routes

```ts
createApp({
  // ...
  middleware: [
    async (c, next) => {
      // auth, request logging, rate limiting, etc.
      await next();
    },
  ],
});
```

These run on every request before any module route. The container is already set up.

### 2. Inside the `routes` callback, before the module mount

```ts
routes: (base) =>
  base
    .use('/posts/*', authMiddleware)
    .route(postsModule.prefix, postsModule.routes),
```

Apply middleware to a subset of paths.

### 3. Inside the module's routes file

```ts
export const postsRoutes = new Hono<AppEnv>()
  .use('*', loggingMiddleware)
  .get('/', /* ... */);
```

Apply to every route in this module.

The `defineMiddleware` helper from `@katajs/core` is a typed-identity helper: it gives you the right `Context` type without you having to import `MiddlewareHandler` and friends.

```ts
import { defineMiddleware } from '@katajs/core';

export const requireAuth = defineMiddleware(async (c, next) => {
  const session = c.var.resolve('authService').getSession(c);
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  await next();
});
```

## Errors flow through `errorMapper`

Anything thrown in a route handler — domain errors, validation errors, unexpected exceptions — is caught by `errorMapper` and turned into a structured JSON response. See [Errors](./errors.md) for the full mapping.

You can pass `errorMapper` config to `createApp`:

```ts
createApp({
  // ...
  errorMapper: {
    onUnhandled: (err, ctx) => {
      // Send to Sentry, Logflare, etc.
      console.error('[unhandled]', ctx.requestId, err);
    },
  },
});
```

## Where module routes get mounted

`createApp` doesn't auto-mount module routes — you do, in the `routes` callback. The order in `modules: [...]` is unrelated to mount order. The order in the `routes` callback determines mount order, and (because Hono routes are matched in declaration order) determines route precedence.

In practice this only matters if two modules' prefixes overlap, which is unusual.

## What you don't get

- **No file-based routing.** A backend API doesn't benefit the way a UI router does — a server route name conveys very little, and resource APIs rarely look like file trees.
- **No route DSL.** Hono's chaining API is the API. We don't wrap it.
- **No automatic OpenAPI generation in core.** That ships as `@katajs/openapi` in v0.3, wrapping `@hono/zod-openapi`.
