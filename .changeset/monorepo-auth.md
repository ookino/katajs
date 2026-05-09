---
'create-katajs': minor
'@katajs/cli': minor
'@katajs/core': minor
'@katajs/drizzle': minor
---

**`create-katajs --monorepo --auth`** — Phase 2 of the monorepo scaffolder. Better Auth is now extracted into a workspace package alongside the auth tables and a thin module that wraps the routes.

The shape:

```
my-app/
├── apps/api/
│   └── src/modules/auth/         ← module wrapping the auth instance
│       ├── index.ts              ← defineModule, AuthRegistry, re-exports
│       ├── auth.errors.ts
│       ├── auth.middleware.ts    ← attachUser / requireAuth helpers
│       └── auth.routes.ts        ← Hono catch-all that delegates to auth.handler
├── packages/
│   ├── auth/                     ← Better Auth instance + types
│   │   ├── package.json          ← @<project>/auth, depends on @<project>/db
│   │   └── src/auth.ts           ← createAuth(db, env): per-request factory
│   └── db/
│       └── src/auth-schema.ts    ← user, session, account, verification tables
```

The auth module's `provides` factory calls `createAuth(c.db, c.env)` per request. `packages/db/src/index.ts` is augmented to re-export `auth-schema` so apps consume all tables via `@<project>/db`.

Implementation:

- New `auth-snippets/monorepo/` template tree (9 files).
- New `augmentForAuthMonorepo` function in `scaffold.ts` mirroring the single-API auth augmentation but with monorepo paths: app.ts/types.d.ts/graph.ts under `apps/api/`, schema re-export at `packages/db/src/index.ts`, deps + env vars at `apps/api/`.
- Bug fix: file rename `_gitignore`/`_dev.vars.example` → `.gitignore`/`.dev.vars.example` now happens BEFORE auth augmentation (was happening after, so single-API `--auth`'s `BETTER_AUTH_SECRET` append to `.dev.vars.example` was silently failing).
- `--auth + --monorepo` no longer warns "not yet supported"; the path is fully wired.

Tests: 7 new in `scaffold-monorepo.test.ts` covering file generation, project-name substitution into `@<project>/auth`/`@<project>/db` references, app.ts / types.d.ts / graph.ts mutations, db re-export, package.json deps merge, dev vars append. Workspace total: 155 passing.

End-to-end verified: scaffolded a `--monorepo --auth` project, installed with workspace overrides (4 packages: apps/api + packages/{auth, db, api-client}), `pnpm typecheck` clean across all four.
