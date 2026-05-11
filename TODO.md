# `@katajs` — roadmap

State as of this writing: 4 packages, 88 tests passing, working CLI scaffold (single-API only), real-PG integration tests, static graph devtools (Shape A). v0.1 runtime is solid. This document captures everything left, organized by milestone.

---

## Positioning (decided)

**`@katajs` is a Cloudflare Workers framework**, not a generic Hono toolkit. The branding, docs, templates, and CLI are all Workers-first. `@katajs/core` itself stays runtime-agnostic internally (no Workers imports), so the door's open if a multi-runtime story ever earns its way in. Adapters (`@katajs/drizzle`, future `@katajs/queues`, etc.) are explicitly Workers-only.

Tagline candidate: *"The opinionated Hono framework for Cloudflare's full stack."*

---

## v0.1 publish blockers (small, do these before announcing)

- [ ] **§19 publishing decisions** — repo owner / GitHub org, CLA vs DCO, public vs quiet announcement strategy.
- [ ] **README** at the workspace root (5-minute quickstart, why-does-this-exist, link to concepts).
- [ ] **Concept pages** under `docs/concepts/` — see "Concept docs" section below.
- [ ] **Changeset for v0.1.0** — first publish to npm under the `@katajs` scope.
- [ ] **GitHub repo** created, CI configured (typecheck + tests on PR), PR template, issue templates.
- [ ] **Verify `pnpm publish` flow** with a Verdaccio dry-run before hitting real npm.

---

## v0.2 — feature parity with "real" frameworks

Headline items, roughly in the order I'd tackle them.

### 1. CLI: `add` subcommands

Today the CLI only scaffolds projects. v0.2 adds project mutators:

- [ ] `katajs add module <name>` — scaffolds `src/modules/<name>/` with the standard 6-file shape, updates `src/types.d.ts` Registry composition, updates `src/app.ts` modules array + route chain, regenerates `graph.html`.
- [ ] `katajs add service <name> --in <module>` — adds a service file inside an existing module + wires it into `provides` + extends the module's `XxxRegistry` type.
- [ ] `katajs add route <method> <path> --in <module>` — adds a handler to a module's `posts.routes.ts`, optionally generating a Zod schema stub.
- [ ] `katajs add migration <name>` — wraps `drizzle-kit generate` with a friendlier name + checks.
- [ ] `katajs add queue <name>` — scaffolds a queue + a consumer module (depends on Queues work below).
- [ ] `katajs add cron <name>` — scaffolds a Cron Trigger handler.
- [ ] `katajs add do <name>` — scaffolds a Durable Object class + binding.
- [ ] `katajs upgrade` — bump `@katajs/*` versions across a project + run any codemods.

Reference: NestJS's `nest generate`. Implementation: extend the existing `packages/cli` with subcommands, share template rendering with the project scaffolder.

### 2. Cloudflare Queues integration

Add a first-class queues story. Core decisions:

- [ ] **Adapter package** — `@katajs/queues` exposing `createQueueHandler(...)` that builds a per-message container (request-scoped equivalent for queue messages).
- [ ] **Module shape extension** — modules can optionally declare `consumers: { 'message.type': handler }` alongside `routes`. Discriminates by message type.
- [ ] **Producer ergonomics** — services can `c.resolve('queues').sendOrders.send(msg)` to enqueue. Queue bindings appear in `c.env`; the adapter wraps them with typed senders.
- [ ] **Single-API mode** — same Worker, dual entry points (`fetch` + `queue`).
- [ ] **Monorepo mode** — `apps/worker/` is a separate Worker that consumes the queue. Reuses `packages/db` and `packages/modules` (if extracted).
- [ ] **CLI** — `katajs add queue <name>` scaffolds the binding in `wrangler.jsonc`, registers the consumer module, updates types.
- [ ] **Tests** — Miniflare's queue-simulation in vitest covers unit tests; integration test publishes a real message in dev.

Open questions before building:
- Should queue consumers share modules with the HTTP app, or be a sibling app?
  Default: sibling for monorepo, shared for single-API.
- How are message types validated? Zod schemas at the queue boundary, similar to HTTP `validate()`.
- Retry / DLQ ergonomics — surface Cloudflare's retry semantics in the consumer signature.

### 3. `--monorepo` CLI mode (deferred from spec §12.3–12.4)

The original spec called for this in v0.1; we deferred it. Re-tackle in v0.2:

- [ ] `create-katajs my-monorepo --monorepo` produces:
  - `apps/api/` — the Hono+Workers app (mirrors current single-API shape minus `packages/db`)
  - `apps/web/` — one-line README pointing at TanStack Start scaffolder
  - `packages/db/` — extracted Drizzle schema, migrations, types
  - `turbo.json`, `pnpm-workspace.yaml`, root `package.json` with delegating scripts
  - `.github/workflows/deploy.yml` builds packages first, deploys `apps/api`
- [ ] `--auth` adds `packages/auth/` extracted Better Auth instance + `apps/api/src/modules/auth/` thin module mounting routes.
- [ ] `--monorepo` + queues adds `apps/worker/` as a sibling app sharing `packages/db`.
- [ ] Document the "when to choose monorepo" rule in the scaffold's README (also covered in concepts).

### 4. Devtools Shape B — interactive web UI

The static `graph.html` (Shape A) ships now. Shape B is the Nest-Devtools-style interactive tool. Discussed architecture:

- [x] New package `@katajs/devtools` (dev dependency).
- [x] Stack: Vite + React + TypeScript + Tailwind + React Flow (xyflow). (Skipped shadcn — plain Tailwind keeps the bundle leaner; revisit if real component complexity shows up.)
- [x] CLI bin: `npx katajs-devtools` spawns local server on `:4242`, opens browser.
- [x] Loader Mode 1: imports user's `modules` tuple, calls `inspectModules()`, hands JSON to UI.
- [ ] Loader Mode 2 (fallback): fetches from `__katajs/graph.json` debug endpoint on the user's running Wrangler dev.
- [x] UI panels: graph canvas, modules sidebar, drill-down detail drawer (provides/requires/routes), routes table with filtering, command palette (Cmd+K).
- [ ] Source-link integration (`vscode://file/...` jump-to-file from a module/service).
- [ ] Validation schema preview (Zod schema + example values rendered in the drawer).
- [x] No analytics, no telemetry, fully local.
- [x] Queue producer/consumer awareness — modules render a "consumes <BINDING>" badge, sidebar has a Producers section, drawer shows `fed by producer:` backlinks for consumers and `Consumers:` lists for producers. Cmd+K palette includes Producers.
- [ ] **Multi-Worker / monorepo support.** Today devtools loads exactly one `scripts/modules.ts` (the cwd's). In `--monorepo --worker` shape (producer in `apps/api`, consumer in `apps/worker`), the producer/consumer pair lives across two Workers and devtools can't show the cross-Worker edge. Need: `katajs-devtools --root apps/api --root apps/worker` (or auto-discover `apps/*/scripts/modules.ts`); data shape gains `workers: [{ name, cwd }]` plus a `worker` tag on every module/producer/route; UI renders Worker boundaries (React Flow `parent` nodes) and dotted cross-Worker queue edges where producer.binding matches consumer.queue. ~1 focused session.
- [x] Tag `TODO(Shape B)` references in `packages/core/src/inspect.ts` for the data-contract handoff.
- [x] Shipped 2026-05-10.

### 5. Concept docs — "what is katajs?"

`docs/concepts/` should answer the questions a new user has on day one:

- [x] `docs/concepts/intro.md` — what katajs is, what it isn't, who it's for, why it's opinionated.
- [x] `docs/concepts/modules.md` — the unit of organization; `provides`/`requires`; routed vs services-only; where modules live; flat internal layout; when to split.
- [x] `docs/concepts/container.md` — request-scoped DI, lazy resolution, no global singletons.
- [x] `docs/concepts/registry.md` — the augmentation pattern, why it exists, the strict-resolve story.
- [x] `docs/concepts/transactions.md` — `withTransaction`, repository pattern, tx-bound services.
- [x] `docs/concepts/validation.md` — Zod + `validate()` at boundaries; how it preserves Hono RPC types.
- [x] `docs/concepts/errors.md` — `AppError` subclasses, `errorMapper`, mapping domain errors to HTTP.
- [x] `docs/concepts/routes.md` — the `routes` callback, mounting modules, free-floating routes; single-routes-file convention + Hono sub-app escape hatch.
- [x] `docs/concepts/testing.md` — `makeTestContainer` for unit tests, real-Postgres for integration tests.
- [x] `docs/concepts/devtools.md` — `pnpm graph` (Shape A), Shape B preview.
- [x] `docs/concepts/architecture.md` — when to single-API vs `--monorepo`; when modules are "too big"; sibling-module split pattern; how the graph rewards splitting.
- [ ] `docs/recipes/` — focused how-tos: RPC client, error logging to Sentry, custom middleware, etc.

### 6. Documentation site

**Stack decision: Fumadocs on TanStack Start, deployed to Cloudflare Workers.**

Why this combination over Starlight: dogfoods the same deploy target users will use, lets us embed real React components in docs (live `inspectModules()` graph, Zod schema playground, Hono RPC type-assertion demo), shares vocabulary with the future `@katajs/devtools` (Vite + React + shadcn), and the `fumadocs-typescript` package can render TypeScript types directly into docs (clean way to surface `defineModule`/`createApp` signatures without hand-written drift).

- [ ] **Verify the integration first** — Fumadocs's primary target is Next.js. Confirm the TanStack Start adapter is mature enough for a real docs site (a current template exists, MDX + search + code blocks + TS renderer all work). 10-minute check before committing.
- [ ] **Scaffold the docs app** in `apps/docs/` (likely the moment we adopt a `--monorepo` shape, or start with `docs/` at root and migrate later).
- [ ] **Migrate the 11 concept pages** from `docs/concepts/*.md` into Fumadocs's MDX. Most will copy over verbatim; some can gain interactive examples.
- [ ] **API reference** auto-generated from `@katajs/core` source via `fumadocs-typescript` (preferred) or TypeDoc. Surfaces `defineModule`, `createApp`, `validate`, `AppError`, etc., with their full signatures.
- [ ] **Recipes section** (replaces TODO `docs/recipes/`) — focused how-tos: RPC client, error logging to Sentry, custom middleware, Better Auth integration, etc.
- [ ] **Live `inspectModules()` demo** — a small interactive page that lets users tweak a module list and see the graph + dependency edges update live.
- [ ] **Domain & hosting** — `docs.katajs.dev` (or similar) hosted on Cloudflare Workers via TanStack Start's CF deploy target. Search via Orama (built into Fumadocs) or Algolia DocSearch.
- [ ] **Polish** — shadcn-tier visuals, light/dark mode, code copy buttons, command palette (Cmd+K).

---

## v0.3 — enterprise-grade ecosystem

The "wrapping useful Hono tools" part. Each is its own optional adapter package, dev or production dep depending on what it does.

### Auth providers

- [ ] `@katajs/auth-better` — already partially scaffolded by `--auth`. Wrap session validation as middleware, type the session user via Registry augmentation.
- [ ] `@katajs/auth-clerk` — Clerk integration with the same shape.
- [ ] `@katajs/auth-jwt` — generic JWT verifier for custom auth.

### Storage / data

- [x] **Switch the Postgres driver from `pg` to postgres.js** — done. `@katajs/drizzle` now uses postgres.js (`drizzle-orm/postgres-js`); the adapter builds the client with Cloudflare's Hyperdrive defaults (`max: 5`, `fetch_types: false`) and accepts a `clientOptions` passthrough. `pg`/`@types/pg` peer/dev deps replaced with `postgres ^3.4.0`; templates + examples updated; showcase test harness keeps `pg` as a devDep for its out-of-band SQL assertions. Note: this did **not** remove the `nodejs_compat` requirement — postgres.js still opens a TCP connection through Hyperdrive. Shipped 2026-05-11.
- [ ] **MySQL support in `@katajs/drizzle`** — Hyperdrive supports MySQL as well as Postgres, but the adapter is Postgres-only. Add a `dialect: 'postgres' | 'mysql'` option that branches the driver (postgres.js ↔ `mysql2`) and the matching `drizzle-orm` entrypoint. The `withTransaction` sub-container wiring is dialect-agnostic (`db.transaction(fn)` is the same shape for both), so the divergence is just the ~15-line driver instantiation — a `dialect` option beats a second `@katajs/drizzle-mysql` package that'd be mostly copy-paste. `postgres` and `mysql2` become *optional* peers so a Postgres user never installs `mysql2` and vice versa. Scaffolder may want a `--db mysql` flag down the line. Decide before this lands: does the CLI's `posts` example template stay Postgres-only, or do we ship a MySQL variant?
- [ ] **Cloudflare D1 support in `@katajs/drizzle`** — D1 is the SQLite dialect, accessed via a *binding* (`env.DB`) not a connection string, and needs no `nodejs_compat`. So it's not a `dialect` flag on the Hyperdrive adapter; it's a separate factory — `d1Adapter({ binding: 'DB', schema })` (or `@katajs/d1` if we keep adapters thin) that returns `drizzle(env.DB)` from `drizzle-orm/d1` directly, no pool. `withTransaction` works the same (`db.transaction(fn)`). D1 is the natural "just give me a database, skip Hyperdrive" path for Workers — worth adding alongside the Hyperdrive drivers. Scaffolder gains a `--db d1` option; the `posts` example would need a SQLite-schema variant (`drizzle-orm/sqlite-core` instead of `pg-core`).
- [ ] **Multi-database support** — today `createApp({ db })` is singular and `c.var.withTransaction(fn)` wraps *the* db. Real apps may run more than one (e.g. D1 for sessions + Hyperdrive-Postgres for the domain model). Two shapes: (a) **named map** — `createApp({ db: { primary: ..., sessions: ... } })`, `c.db.primary`, `withTransaction('primary', fn)` — ergonomic but a breaking change to the `db` config + transaction API; (b) **secondary-as-a-service** — keep `db` singular for the primary, document `provides: { sessionsDb: (c) => drizzle(c.env.SESSIONS) }` for the rest — zero framework change but the secondary loses container-managed `withTransaction`. **Decide the named-map shape before v1.0** — pre-1.0 is the only cheap window to make `db` a map; post-1.0 it's a major break. Even if we don't build it now, sketch the API so the door stays open. (Relevant context: the `pg → postgres.js`, MySQL `dialect`, and D1 `d1Adapter` items above all assume a single `db` — revisit them if multi-db lands first.)
- [ ] `@katajs/kv` — Workers KV typed wrapper, treats namespaces as registry-augmented services.
- [ ] `@katajs/r2` — R2 typed wrapper with upload/download helpers.
- [ ] `@katajs/cache` — Cache API + KV cache patterns; per-route cache decorators.
- [ ] `@katajs/vectorize` — Workers Vectorize integration.

### Observability

- [ ] `@katajs/sentry` — `errorMapper.onUnhandled` hook + Sentry initialization. One config function, done.
- [ ] `@katajs/otel` — OpenTelemetry traces with Workers compatibility.
- [ ] `@katajs/logger` — structured logging adapter (defaults to console; pluggable for Logflare/Axiom).

### Async / scheduled

- [ ] `@katajs/queues` — covered in v0.2.
- [ ] `@katajs/cron` — Cron Triggers as a first-class module concept.
- [ ] `@katajs/durable-objects` — DO base class with module/container access.
- [ ] `@katajs/workflows` — Cloudflare Workflows integration.

### API surface

- [ ] `@katajs/openapi` — wrap `@hono/zod-openapi`. One config call generates a typed OpenAPI 3.1 spec from your modules' Zod schemas + routes. Mounted at `/openapi.json` and optionally `/docs` (Scalar/Swagger UI).
- [ ] `@katajs/rate-limit` — route-level rate limiting (Cloudflare Rate Limiting API + KV-based fallback).

### AI / vendor

- [ ] `@katajs/ai` — Workers AI bindings, typed prompt helpers.
- [ ] `@katajs/email` — Resend / Mailgun adapters.
- [ ] `@katajs/webhooks` — signature verification helpers (Stripe, GitHub, Clerk webhooks).

---

## Cross-cutting / quality

- [ ] **Type-level tests** for the public API surface — `expect-type` suite covering `c.var.resolve`, `c.req.valid`, RPC client typing, Registry augmentation. Catches accidental breakage during refactors.
- [ ] **Performance budget** — measure cold start + per-request overhead; commit to keeping it under N ms.
- [ ] **Bundle size budget** — `@katajs/core` published bundle stays under 10KB gzipped.
- [ ] **Documentation lints** — every public export has a JSDoc, every error has a clear message format with module name, every module has a README stub.
- [ ] **Codemods** — when we change a public API, ship a codemod. `katajs upgrade` runs them.
- [ ] **Better error messages at boot** — when boot validation fails, include source-file links + suggested fixes (e.g., "did you mean 'eventService'?" with did-you-mean matching).

---

## Things explicitly NOT doing

Resist the urge. From spec §17 + this session's discussions:

- A request-context AsyncLocalStorage helper — pass the container explicitly via `c.var.container`.
- Multi-database support — out of scope for v1.
- Read replicas — not v1.
- Savepoints / nested transactions with isolation — `withTransaction` reuses the outer.
- A logger abstraction in core (`@katajs/logger` is opt-in adapter, not in core).
- A metrics abstraction in core.
- File-based routing à la TanStack Router — addressed in this session: doesn't fit a server framework.
- A custom HTTP server — Hono is the HTTP layer.
- A ClassyDI container with decorators — not happening.

---

## Milestone tracking

| Version | Theme | Status |
|---|---|---|
| 0.1.0 | Runtime + CLI single-API + showcase | done locally, blocked on §19 + docs before publish |
| 0.2.0 | `add` commands + Queues + monorepo CLI + concept docs + Devtools Shape B | next |
| 0.3.0 | Ecosystem adapters (auth/cache/observability/openapi/etc.) | after v0.2 |
| 1.0.0 | Stabilization, performance/bundle budgets, complete docs site, real first user (YourLight) | when v0.3 ecosystem feels real |

---

## Open questions to settle before we move

1. **Queues consumer architecture**: same Worker (Q1) or separate (Q2)? Recommendation: both, with single-API defaulting Q1 and `--monorepo` defaulting Q2.
2. **Devtools loader strategy**: Mode 1 (import modules at devtools-start) vs Mode 2 (fetch from running app). Recommendation: ship Mode 1 first, Mode 2 as fallback.
3. **CLI naming**: `create-katajs` (scaffolder) + `katajs` (project commands like `add`, `upgrade`)? Or merge into one binary? Recommendation: split — different concerns.
4. **Docs hosting**: katajs.dev domain available? Vercel / Cloudflare Pages / GitHub Pages? Recommendation: Cloudflare Pages, dogfood the platform.
5. **Versioning model**: lockstep across all `@katajs/*` packages (current setup) or independent? Recommendation: lockstep through v1.0, reconsider after.
6. **`katajs.config.ts` for `modulesDir` (and other paths)**: today the CLI hardcodes `src/modules/`. The runtime is filesystem-agnostic, so users *can* put modules elsewhere — they just lose CLI tooling for those modules. Decision deferred: don't add config-creep on personal-preference grounds; revisit if real architectural use cases surface (DDD bounded contexts at `src/<context>/`, monorepo `packages/<name>/src/` layouts, cross-runtime module sharing). When we do add it, the file should also handle: scaffolder template choice, scaffolded project name conventions, opt-out of auto-graph regeneration, etc. — make it land once with a clear surface, not piecemeal.
