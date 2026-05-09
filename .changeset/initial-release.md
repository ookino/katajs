---
'@katajs/core': minor
'@katajs/drizzle': minor
'create-katajs': minor
---

Initial public release of katajs — an opinionated framework for Hono on Cloudflare Workers.

**`@katajs/core`** — runtime: `defineModule`, `createApp`, request-scoped DI container with lazy resolution and cycle detection, `validate()` Zod wrapper preserving Hono RPC types, `AppError` + `errorMapper`, static `inspectModules()` graph inspector, `@katajs/core/testing` helper. Strict registry typing — typos in `requires` and `c.var.resolve()` are TypeScript errors.

**`@katajs/drizzle`** — Drizzle adapter with Cloudflare Hyperdrive Postgres support and `withTransaction` that wires transaction-bound services through a sub-container.

**`create-katajs`** — scaffolding CLI. `pnpm create katajs my-app` produces a single-API Workers project with one example module, Drizzle + Hyperdrive wired up, and `--auth` for Better Auth integration.
