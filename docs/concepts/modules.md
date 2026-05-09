# Modules

A **module** is the unit of organization in katajs. It groups related services and (optionally) routes, declares what it needs from elsewhere, and contributes its services to a request-scoped container.

## The shape

```ts
import { defineModule } from '@katajs/core';
import { makePostRepository, type PostRepository } from './posts.repository';
import { makePostService, type PostsService } from './posts.service';
import { postsRoutes } from './posts.routes';

export const postsModule = defineModule({
  name: 'posts',
  provides: {
    postRepository: (c): PostRepository => makePostRepository(c.db),
    postService: (c): PostsService => makePostService(c),
  },
  requires: ['auditService'] as const,
  routes: postsRoutes,
  prefix: '/posts',
});

export type PostsRegistry = {
  postRepository: PostRepository;
  postService: PostsService;
};
```

Five fields:

| Field | What it is |
|---|---|
| `name` | Display name. Used in error messages and the devtools graph. |
| `provides` | Object mapping service keys to factory functions. Each factory receives a `ModuleContainer` and returns the service. |
| `requires` | `as const` array of service keys this module depends on from *other* modules. Validated at boot. |
| `routes` | A `Hono` instance. Optional — omit for services-only modules. |
| `prefix` | Path prefix for `routes` (e.g., `/posts`). Required when `routes` is set. |

## Two kinds of module

### Routed module

Has `routes` + `prefix`. Mounts HTTP routes at the prefix. Example: `posts`, `comments`, `auth`.

### Services-only module

Omits `routes` and `prefix`. Contributes services to the container without mounting routes. Use for cross-cutting concerns:

```ts
export const eventsModule = defineModule({
  name: 'events',
  provides: {
    eventService: (c): EventService => makeEventService(c.db),
  },
  requires: [] as const,
  // no routes, no prefix
});
```

The two kinds are distinguished at the type level — `RoutedModule` has non-optional `routes`/`prefix`, `ServiceOnlyModule` doesn't have them at all. No `!` non-null assertions needed at the call site.

## `provides`: the factory contract

Each factory takes a `ModuleContainer` and returns a service:

```ts
provides: {
  postRepository: (c) => makePostRepository(c.db),
  postService: (c) => makePostService(c),
}
```

The container passed to a module's factories is **module-scoped**: `c.resolve('key')` autocompletes to keys in this module's own `provides` plus the keys listed in `requires`. Anything outside that surface is a TypeScript error inside the factory.

The factory runs **lazily** the first time `resolve(key)` is called for that key in a given request. The result is cached for the rest of the request. Different requests get fresh instances.

## `requires`: declaring cross-module dependencies

```ts
requires: ['auditService'] as const,
```

The `as const` is mandatory — it's how TypeScript captures the literal strings. Without `as const`, the type widens to `string[]` and you lose the autocomplete + type strictness.

The list is constrained to `RegistryKey`, which is `keyof Registry & string`. That means:

- ✅ `requires: ['auditService'] as const` — `auditService` exists in the Registry.
- ❌ `requires: ['auditServeice'] as const` — typo. TypeScript error: not assignable to `RegistryKey`.
- ❌ `requires: ['notARealService'] as const` — fake key. TypeScript error.

If `requires` is empty, this module has no cross-module dependencies. Some leaf modules (like `events`) need nothing from elsewhere.

## Why `as const`?

```ts
requires: ['auditService']        // type: string[]   — too wide
requires: ['auditService'] as const  // type: readonly ['auditService']  — narrow ✓
```

katajs needs the *literal* `'auditService'` to type-check `c.resolve('auditService')` inside service factories. `as const` preserves it.

## Registry contribution

Each module exports a type describing what it adds to the Registry:

```ts
export type PostsRegistry = {
  postRepository: PostRepository;
  postService: PostsService;
};
```

The app composes these into the Registry via TypeScript module augmentation:

```ts
// src/types.d.ts
import type { PostsRegistry } from './modules/posts';
import type { EventsRegistry } from './modules/events';

declare module '@katajs/core' {
  interface Registry extends PostsRegistry, EventsRegistry {}
}
```

After that, every `c.var.resolve('postService')` call in the app autocompletes and is type-checked against the union of all module registries.

See [Registry](./registry.md) for the full story on why this pattern.

## Boot-time validation

When `createApp` runs, three checks fail loudly with clear errors:

1. **Duplicate provides** — two modules both `provide` the same key. Throws with both module names.
2. **Missing requires** — a module's `requires` lists a key no module provides. Throws with the offending module + missing key + a list of all registered keys.
3. **Dependency cycle** — module A requires B, B requires A (transitively). Throws with the cycle path.

These are *boot-time* errors, not runtime. The Worker won't start with an invalid graph.

## Where modules live

By convention, each module lives in `src/modules/<name>/`:

```
src/modules/posts/
  index.ts           — defineModule call + Registry slice export
  posts.routes.ts    — Hono route definitions
  posts.service.ts   — business logic
  posts.repository.ts — database access
  posts.schema.ts    — Zod schemas
  posts.errors.ts    — AppError subclasses
```

The CLI's `katajs add module <name>` generates this layout, and `katajs add service` and `katajs add route` look here when extending an existing module.

**The runtime doesn't enforce the location.** `defineModule(...)` is a function call; `createApp({ modules: [...] })` takes objects. You can put modules anywhere — `src/`, `src/features/`, `src/<bounded-context>/`, even alongside unrelated code — and the runtime works identically. Only the CLI assumes `src/modules/`.

`src/modules/` is part of the framework's opinion for three reasons:

1. **Newcomer legibility.** Every katajs project looks the same. Someone opening a new repo knows where to look.
2. **CLI tractability.** `katajs add` has one place to scaffold into without per-command flags or a config file.
3. **Mental separation.** `src/modules/` is "framework territory." `src/lib/`, `src/db/`, `src/utils/` are yours.

If you have a strong architectural reason to deviate (DDD bounded contexts at `src/<context>/`, monorepo layouts where modules live in sibling packages, cross-runtime sharing), the runtime is fine with it — you just lose CLI tooling for those modules.

## Module internal layout is flat

Inside a module, all the files sit at the same level. There's no `services/`, `repositories/`, or `routes/` subfolder, even when a module has multiple of each:

```
src/modules/posts/
  index.ts
  posts.errors.ts
  posts.repository.ts
  posts.routes.ts
  posts.schema.ts
  posts.service.ts
  archived.service.ts        ← second service, same level as the first
  featured.service.ts        ← third service, same level
```

`katajs add service <name> --in posts` writes new service files at the module root, not into a subfolder. This is intentional.

**Why flat:** modules are meant to stay small. Most have 1–2 services and one routes file. The visual cost of a flat layout (5–8 files in one folder) is lower than the cost of empty `services/`, `routes/`, etc. folders that exist for the sake of structure. Imports stay short (`./archived.service` vs `./services/archived.service`). Every module looks the same.

## When a module is "too big" — split, don't nest

If a module accumulates more than ~3 services or its routes file pushes past ~200 lines, the right refactor is almost always to **split it into multiple modules**, not to bury its internals in subfolders.

A `posts` module that grew `archivedService`, `featuredService`, `searchService`, and `recommendationService` is four modules in disguise. Splitting them gives you:

- **Cleaner dependency declarations.** Each new module declares `requires: ['postService']` if it needs the core posts service. The relationships are visible in the source, not hidden inside a single bloated module.
- **Better module names in errors.** Boot validation and runtime errors say "module `posts-search`" instead of "module `posts` (the search service)."
- **Separate entries in the devtools graph.** [`inspectModules()`](./devtools.md) shows each module as a node with its own routes and dependencies. A split graph is easier to read than one giant node with dozens of services.

The framework's split-vs-nest stance comes through in tooling decisions too: the CLI doesn't have `--in-folder`, `--file <route-file>`, or config-driven module layouts. If you genuinely want to deviate (move services into a `services/` folder by hand, split your routes file via Hono sub-apps), the runtime is fine with it; the CLI just won't know about your custom shape.

See [Architecture](./architecture.md) for splitting heuristics in more depth.

## Ordering in the modules array

Module order in `createApp({ modules: [...] })` doesn't affect runtime — boot validation handles the dependency graph. Order them for *reading*: a sensible convention is dependency-graph order (leaves first, dependents last):

```ts
modules: [
  eventsModule,        // depended on by audit
  auditModule,         // depended on by posts, comments
  usersModule,         // independent
  postsModule,         // depends on audit
  commentsModule,      // depends on audit
],
```

That way someone reading the file top-to-bottom sees a topo-sorted view of the system.
