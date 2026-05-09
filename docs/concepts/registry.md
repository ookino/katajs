# Registry

The Registry is how katajs knows what services exist in your app at *type* level. It's the table TypeScript consults whenever you write `c.var.resolve('postService')` or `requires: ['auditService'] as const`. Get it right and the editor autocompletes every service key, every typo is a compile error, and you never write `as` to coerce a resolved service.

## The shape

`@katajs/core` exports an empty interface called `Registry`:

```ts
// In @katajs/core
export interface Registry {}
```

Empty by design. Your app fills it in via TypeScript's [module augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation):

```ts
// src/types.d.ts
import type { PostsRegistry } from './modules/posts/index';
import type { EventsRegistry } from './modules/events/index';

declare module '@katajs/core' {
  interface Registry extends PostsRegistry, EventsRegistry {}
}
```

After that, `Registry` resolves to the union of every `XxxRegistry` slice you composed, and `RegistryKey` (which is `keyof Registry & string`) is the union of every service key your app declares.

## Why the augmentation pattern

There are three plausible designs for typing a DI container's keys, and katajs chose the third:

| Approach | What it looks like | Trade-off |
|---|---|---|
| **String everywhere** | `c.resolve<PostService>('postService')` | No autocomplete on the key, typos pass typecheck. The `as` keyword shows up everywhere. |
| **Auto-derive from `typeof modules`** | `Registry = ResolvedProvides<typeof modules>` | Cleaner-looking, but the inference becomes circular: each module's factories take a `ModuleContainer` typed against `Registry`, and `Registry` is derived from the modules. TypeScript can't always unwind that. |
| **Module augmentation (this is what katajs does)** | Each module exports a `XxxRegistry` slice; `types.d.ts` composes them | Explicit, no circularity, fast to typecheck. Cost: one extra `extends` clause per module. |

The CLI's `katajs add module` writes the `import type` line and the `extends` clause for you, so the cost is zero in practice once you're using the tooling.

## Why the empty default matters

The empty `Registry` interface is doing something subtle: when you import `@katajs/core` *without* augmenting `Registry`, every `c.var.resolve(...)` call fails to compile because `RegistryKey` is `never`. That's the loud-failure mode telling you "you forgot to wire up your registry":

```ts
// Without `declare module '@katajs/core' { interface Registry extends ... }`:
const x = c.var.resolve('postService');
//                       ~~~~~~~~~~~~~
// Argument of type '"postService"' is not assignable to parameter of type 'never'.
```

Same thing for `requires`:

```ts
// Without augmentation:
requires: ['auditService'] as const,
//          ~~~~~~~~~~~~~~
// Type '"auditService"' is not assignable to type 'never'.
```

This catches the most common new-project bug — defining modules but forgetting to compose their slices into `Registry` — at boot time, with a clear error pointing at the empty key set.

## Each module exports a slice

A module's slice is just a TypeScript type listing its `provides`:

```ts
// src/modules/posts/index.ts
export const postsModule = defineModule({
  name: 'posts',
  provides: {
    postRepository: (c) => makePostRepository(c.db),
    postService: (c) => makePostService(c),
  },
  // ...
});

export type PostsRegistry = {
  postRepository: PostRepository;
  postService: PostsService;
};
```

The slice mirrors `provides` *exactly* — same keys, same value types. Mismatch means resolved services won't be typed correctly. This duplication is the one wart of the module-augmentation approach; a future helper might derive the slice from the module value, but for now you write it explicitly.

`katajs add service <name> --in <module>` extends the slice automatically when adding a service, so you only edit it manually if you're doing custom work.

## How `requires` and `c.var.resolve` use the Registry

Inside a module's service factory, the container is `ModuleContainer<PSelf, RKeys>` — narrowed to keys in this module's own `provides` plus its `requires`. The narrowing is implemented as TypeScript overloads on `resolve`:

```ts
// (simplified from packages/core/src/types.ts)
export interface ModuleContainer<
  PSelf extends Record<string, unknown>,
  RKeys extends string,
> extends RequestContainer {
  resolve<K extends keyof PSelf & string>(key: K): PSelf[K];
  resolve<K extends RKeys>(key: K): K extends RegistryKey ? Registry[K] : unknown;
}
```

In a route handler (outside any module's factory), you use the wider `RequestContainer`:

```ts
export interface RequestContainer extends BaseContainer {
  resolve<K extends RegistryKey>(key: K): Registry[K];
  // ...
}
```

Both views ultimately bottom out in `RegistryKey = keyof Registry & string`. Your augmentation populates `Registry`; everything else falls out.

## The autocomplete you get

The payoff for the augmentation work is editor-grade autocomplete in three places:

```ts
requires: ['▌'] as const,
//          ↑ autocompletes to every key in Registry

c.var.resolve('▌');
//             ↑ same autocomplete

inside a module factory:
c.resolve('▌');
//          ↑ autocompletes to this module's `provides` + its `requires`
```

And typo-strict rejection in those same places: `requires: ['auditServeice']` is a TypeScript error, not a runtime surprise.

## Where to put the augmentation

Convention: `src/types.d.ts`. The `.d.ts` extension means TypeScript picks it up via the `include` glob without you needing to import it from your runtime files. The augmentation applies globally to anywhere `@katajs/core` is imported in your project.

```ts
// src/types.d.ts
import type { DrizzleClient } from '@katajs/drizzle';
import type * as schema from './db/schema';
import type { Bindings } from './app';

import type { PostsRegistry } from './modules/posts/index';
// katajs:registry-imports

declare module '@katajs/core' {
  interface AppDb extends DrizzleClient<typeof schema> {}
  interface AppEnv extends Bindings {}
  interface Registry
    extends PostsRegistry
    // katajs:registry
  {}
}
```

Three augmentations happen in this one file:

- `Registry` — the service key map (the focus of this page).
- `AppDb` — your Drizzle client type, so `c.db` is correctly typed.
- `AppEnv` — your Cloudflare bindings, so `c.env` is correctly typed.

The `// katajs:registry-imports` and `// katajs:registry` markers are anchors used by `katajs add module` to insert new modules' slices automatically.

## Tests and Registry pollution

Tests sometimes need to add throwaway services to the container. If a test file augments `Registry` with `interface Registry { dummy: ... }`, and your `tsconfig.json` includes both `src/` and `test/`, the test augmentation pollutes your *real* code's autocomplete — `c.var.resolve('dummy')` shows up in your editor everywhere.

The fix is a tsconfig split. The showcase example does it like this:

```jsonc
// tsconfig.json — used for src only
{
  "include": ["src/**/*"]
}
```

```jsonc
// tsconfig.test.json — used by vitest
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*", "test/**/*"]
}
```

```jsonc
// package.json
"scripts": {
  "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json"
}
```

Source code typechecks with `tsconfig.json`, so the editor (and `tsc --noEmit`) sees only the production Registry. Tests typecheck with `tsconfig.test.json`, which includes everything and resolves test-only augmentations correctly.

This split is part of the create-katajs scaffolder's output by default.

## Summary

- `Registry` is a globally-augmentable interface. Empty by default; you fill it.
- Each module exports a `XxxRegistry` slice listing its `provides` types.
- `src/types.d.ts` composes the slices into `Registry` via `interface Registry extends X, Y, Z {}`.
- `RegistryKey = keyof Registry & string` is what powers autocomplete and rejects typos.
- A tsconfig split keeps test-time augmentations from leaking into `src/` autocomplete.
