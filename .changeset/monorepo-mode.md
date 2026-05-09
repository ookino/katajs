---
'create-katajs': minor
'@katajs/cli': minor
'@katajs/core': minor
'@katajs/drizzle': minor
---

**`create-katajs --monorepo`** — Phase 1 of the monorepo scaffolder. Produces a pnpm + Turbo workspace with three packages and one app:

- `apps/api/` — the Hono + Cloudflare Workers app (mirrors the single-API shape minus the local `db/` folder).
- `packages/db/` — Drizzle schema, migrations, and `drizzle.config.ts`. Apps consume it as `@<project>/db`.
- `packages/api-client/` — generic typed Hono RPC client factory. Generic over `AppType` so the package has zero workspace coupling — consumers bring their own `import type { AppType } from '@<project>/api'`.
- Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.github/workflows/deploy.yml`.

Internal packages use TypeScript source resolution (no build step). Turbo orchestrates `dev`, `test`, `typecheck`, and `deploy` tasks.

Phase 1 limits:
- `--auth + --monorepo` not yet supported (warns and continues without auth scaffolding).
- `katajs add module/service/route` only walks up to find `@katajs/core` — running from the monorepo root won't find `apps/api/` automatically yet (run from `apps/api/` for now).

Phase 2 (next): auth extraction into `packages/auth/`, root-level `katajs add` support, queue-consumer `apps/worker/` companion.
