# Architecture

This page covers the structural decisions you'll make at the project level: when a module is "too big," when to split into sibling modules, and (later) when to graduate from a single-API project to a `--monorepo` layout. It's the synthesis of the [modules](./modules.md), [container](./container.md), and [routes](./routes.md) pages — the practical "how do I shape this" guide.

## The single-API default

Every project scaffolded with `pnpm create katajs` starts as a single-API Workers app:

```
my-app/
  src/
    app.ts                  ← the Hono app + createApp({...})
    db/schema.ts            ← Drizzle schema
    modules/
      posts/                ← one module per feature
        index.ts
        posts.routes.ts
        posts.service.ts
        posts.repository.ts
        posts.schema.ts
        posts.errors.ts
    types.d.ts              ← Registry composition
    index.ts                ← Worker entry
  scripts/graph.ts
  drizzle.config.ts
  wrangler.jsonc
  package.json
```

This is the right starting shape for almost every project. One Worker, one deployment, one schema. You add modules as your app grows.

## When a module is "too big"

The framework's preferred answer to "my module is unwieldy" is **split it**, not nest its internals. Concrete heuristics for when to split:

| Signal | What it suggests |
|---|---|
| **More than ~3 services in `provides`** | Likely two or more modules in disguise. |
| **Routes file > ~200 lines** | The handlers probably cluster into 2+ logical surfaces (public/admin, REST/webhooks, list/CRUD vs search). |
| **`requires` list growing past 3-4** | The module is becoming a coordinator of others. Coordinator modules should be small. |
| **Single service file > ~500 lines** | Look for sub-services — sometimes one method tree is really three. |

These are guidelines, not laws. A module with 5 small services and 50 lines of routes is fine. A module with 2 huge services and 400 lines of routes might warrant a split. Use judgment.

## The shape of a split

When you split, you're producing **sibling modules at related sub-prefixes** and using `requires:` to declare cross-module use:

```ts
// Before (one fat module):
const postsModule = defineModule({
  name: 'posts',
  prefix: '/posts',
  provides: {
    postRepository: ...,
    postService: ...,
    postSearchService: ...,    // search-specific
    postFeatureService: ...,   // editor / curator features
    postRecommendationService: ...,
  },
  requires: ['auditService'] as const,
  // posts.routes.ts is now 400 lines mixing public, admin, search, recommendations
});

// After (three sibling modules):
const postsModule = defineModule({
  name: 'posts',
  prefix: '/posts',
  provides: {
    postRepository: ...,
    postService: ...,
  },
  requires: ['auditService'] as const,
});

const postsSearchModule = defineModule({
  name: 'posts-search',
  prefix: '/posts/search',
  provides: { postSearchService: ... },
  requires: ['postRepository'] as const,    // ← visible cross-module dep
});

const postsAdminModule = defineModule({
  name: 'posts-admin',
  prefix: '/posts/admin',
  provides: { postFeatureService: ..., postRecommendationService: ... },
  requires: ['postService', 'auditService'] as const,
});
```

Three things to notice:

- **Sub-prefixes show the relationship.** `/posts`, `/posts/search`, `/posts/admin` — clearly part of the same domain.
- **`requires:` declarations are explicit.** `posts-search` openly says it depends on `postRepository`. The graph in `inspectModules()` shows this as an edge.
- **Each module's routes file is small.** No monster files.

## What the devtools graph rewards

The [`inspectModules()`](./devtools.md) graph rewards splitting in a way that's hard to overstate. Compare:

**Before split** — one giant node:
```
graph TD
  posts["<b>posts</b><br/><small>/posts • +5 services</small>"]
  audit["<b>audit</b><br/>+2 services"]
  posts -->|auditService| audit
```

**After split** — three nodes, three edges, the structure visible:
```
graph TD
  posts["<b>posts</b><br/><small>/posts • +2 services</small>"]
  posts_search["<b>posts-search</b><br/><small>/posts/search • +1 service</small>"]
  posts_admin["<b>posts-admin</b><br/><small>/posts/admin • +2 services</small>"]
  audit["<b>audit</b><br/>+2 services"]
  posts -->|auditService| audit
  posts_search -->|postRepository| posts
  posts_admin -->|postService| posts
  posts_admin -->|auditService| audit
```

The second one tells a story; the first one hides it. When a new contributor opens `pnpm graph`, the second is dramatically more legible — you can see which modules depend on which, where the framework is doing its job, and where new features might land.

## Cross-module dependencies: prefer service-level

When module A needs something from module B, declare a service-level dependency, not a module-level one:

```ts
// ✓ Good — service-level
requires: ['postRepository'] as const,

// ✗ Avoid — there's no "module-level" dependency primitive in katajs,
// but conceptually some users try to reach for "the whole posts module."
```

Because the framework's primitive is the service registry (not modules), you depend on what you actually use. If `posts-search` only needs to read posts, it depends on `postRepository`, not `postService`. That's a tighter contract: refactoring `postService` doesn't break `posts-search`.

This shows up in the graph too — the edge label is the service key (`postRepository`), so you see *what* the cross-module use is, not just that there's a use.

## The audit/events services-only pattern

Some modules have no routes — they're internal infrastructure other modules use. The showcase has two:

```ts
const eventsModule = defineModule({
  name: 'events',
  provides: {
    eventRepository: ...,
    eventService: ...,
  },
  requires: [] as const,
  // No routes — internal only.
});

const auditModule = defineModule({
  name: 'audit',
  provides: {
    auditRepository: ...,
    auditService: ...,
  },
  requires: ['eventService'] as const,
  // No routes — internal only.
});
```

Use this for cross-cutting concerns:

- An audit logger every module writes to (the showcase pattern).
- An events recorder consumed by analytics or queues.
- A logger / Sentry adapter that's accessed via `c.var.resolve('logger')` from any module.
- A clock or UUID service for test seams.

These are still modules — they show up in the graph, get name attribution in errors, and benefit from the same boot validation. They just don't mount HTTP routes.

## Free-floating routes

The `routes` callback in `createApp` is for routes that don't belong to any module:

```ts
routes: (base) =>
  base
    .get('/health', (c) => c.json({ ok: true }))
    .get('/version', (c) => c.json({ v: '1.0.0' }))
    .post('/webhooks/stripe', stripeWebhookHandler)
    .route(postsModule.prefix, postsModule.routes),
```

Use this for `/health`, `/ready`, `/version`, webhooks, debug introspection. Anything where wrapping in a module would feel forced.

## When to graduate to `--monorepo`

For some projects, a single Workers package outgrows itself:

- Frontend (TanStack Start, etc.) and backend share types via Hono RPC, but they're separately deployed.
- A queue consumer needs to share modules with the HTTP app but is a separate Worker.
- Multiple Workers (admin, public, API) share the same database schema.

`pnpm create katajs my-monorepo --monorepo` produces a layout where the Drizzle schema, types, and shared code live in `packages/`, and the various apps (`apps/api`, `apps/worker`, `apps/web`) consume them:

```
my-monorepo/
  apps/
    api/             ← the main Hono+Workers app
    worker/          ← (with --monorepo --worker) sibling Worker for queue consumers
    web/             ← TanStack Start (one-line README pointing at its own scaffolder)
  packages/
    db/              ← Drizzle schema, migrations, types
    auth/            ← (with --auth) Better Auth instance
  turbo.json
  pnpm-workspace.yaml
  package.json
```

Combine flags as you need: `--monorepo`, `--monorepo --auth`, `--monorepo --worker`, or all three. If you start as a single-API project and outgrow it, the migration is mostly mechanical: extract `packages/db`, move the auth module into `packages/auth`, point apps' imports at the workspace packages.

The decision rule:

| Project shape | Use |
|---|---|
| One Worker, no queues, no separate frontend deploys | Single-API (default) |
| Frontend deploy + one Worker, types shared via RPC | Single-API for the API; the frontend lives elsewhere |
| Multiple Workers (HTTP + queue consumer + cron) | `--monorepo` |
| Frontend, backend, queue consumer, all sharing types and modules | `--monorepo` |

Most projects start single-API and never need to graduate. That's fine — the framework doesn't reward premature complexity.

## Things this framework deliberately doesn't do

Stated for the record so design conversations don't drift here later:

- **No file-based routing.** Server APIs don't benefit the way UI frameworks do.
- **No class-based DI.** No decorators, no `reflect-metadata`, no `@Injectable()`. Modules are plain objects from `defineModule(...)`.
- **No multi-database support.** v1 is one Drizzle client per Worker.
- **No nested transactions with savepoints.** v0.1's `withTransaction` reuses the outer; that's the contract.
- **No global request context (AsyncLocalStorage).** The container is passed explicitly via `c.var.container`.
- **No metrics or logger abstraction in core.** Adapters (`@katajs/logger`, etc.) ship as opt-in packages.
- **No "configuration creep."** No `katajs.config.ts` with knobs for `modulesDir`, file patterns, etc. The conventions are the framework. The runtime is filesystem-agnostic if you must deviate, but the CLI assumes the conventions.

If you find yourself reaching for one of these, the framework's not the right fit for that need — pick a different tool, or live with it.

## Summary

- Default to single-API + `src/modules/` until you outgrow it.
- Split modules when they exceed ~3 services or routes get unwieldy.
- Sibling modules at related sub-prefixes; declare cross-module service deps with `requires:`.
- The devtools graph (`pnpm graph`) is your design feedback loop — split-and-the-graph-clarifies is the signal.
- Free-floating routes (`/health`, webhooks) live in `createApp`'s `routes` callback.
- Services-only modules carry cross-cutting concerns (logging, audit, events).
- `--monorepo` for projects with multiple deployable apps sharing modules; pair with `--auth` and/or `--worker` for the full set.
