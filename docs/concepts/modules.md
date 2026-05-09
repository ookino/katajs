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

See [Registry](./registry.md) (coming in v0.2) for the full story on why this pattern.

## Boot-time validation

When `createApp` runs, three checks fail loudly with clear errors:

1. **Duplicate provides** — two modules both `provide` the same key. Throws with both module names.
2. **Missing requires** — a module's `requires` lists a key no module provides. Throws with the offending module + missing key + a list of all registered keys.
3. **Dependency cycle** — module A requires B, B requires A (transitively). Throws with the cycle path.

These are *boot-time* errors, not runtime. The Worker won't start with an invalid graph.

## File layout

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

The CLI's `katajs add module <name>` (v0.2) generates this layout.

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
