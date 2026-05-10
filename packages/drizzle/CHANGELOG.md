# @katajs/drizzle

## 1.0.0

### Minor Changes

- 509cf60: **`@katajs/cli`** — new package shipping in-project commands. v0.2 ships three:

  - **`katajs add module <name>`** — scaffolds a new module with 5 files (index, service, routes, schema, errors) and wires it into `src/types.d.ts`, `src/app.ts`, and `scripts/graph.ts`.
  - **`katajs add service <name> --in <module>`** — adds a single service to an existing module and wires it into the module's `provides`, Registry slice, and imports.
  - **`katajs add route <method> <path> --in <module>`** — appends a new route handler to a module's `<module>.routes.ts` chain with a `// TODO` stub.

  All mutations target anchor-comment markers; falls back to printing the snippet for manual paste if anchors are missing or have been customized.

  **`create-katajs`** — scaffolder templates now include anchor markers (app-level: `// katajs:registry`, `// katajs:modules`, `// katajs:routes`; module-level: `// katajs:module-service-imports`, `// katajs:module-provides`, `// katajs:module-registry`, `// katajs:module-routes`) so the `katajs add` family can mutate generated projects automatically. The `--auth` augmentation path was refactored to use the same anchor-based codemod helpers.

  **`@katajs/core`** and **`@katajs/drizzle`** versions bump in lockstep but ship no code changes in this release.

- fd7ad5d: **`katajs add queue <name> --in <module>`** — new CLI command for scaffolding queue consumers on existing modules.

  Generates `src/modules/<module>/<name>.consumer.ts` with a Zod schema starter and a `handle` (or `handleBatch` with `--batch`) function. Wires it into the module's `index.ts` via the `// katajs:module-service-imports` and the new `// katajs:module-consumer` anchor. Prints `wrangler.jsonc` queue binding snippets and a `Bindings` type snippet for manual paste — those parts touch user-customizable territory and aren't auto-mutated.

  Flags: `--binding <BINDING>` (default: `<NAME>_QUEUE`), `--dlq <DLQ_BINDING>` (adds `dlq:` and `maxRetries: 5` to the spec), `--batch` (generate `handleBatch` instead of `handle`).

  In **`@katajs/core`**:

  - New `defineConsumer<TBody>(spec)` helper. Drives contextual typing for the inner `handle` / `handleBatch` callbacks so `message.body` is inferred from the schema instead of widening to `unknown` (which is what bare `satisfies` produces). The generated consumer template uses this helper.
  - `ConsumerSpec` type generic relaxed: now `ConsumerSpec<TBody = unknown>` (was `ConsumerSpec<TSchema extends MessageSchema>`). `handle` and `handleBatch` are now both optional at the type level — runtime validates that exactly one is present and throws clearly otherwise. The previous discriminated-union form fought TypeScript's `satisfies` and contextual-typing inference.

  Templates updated with the new `// katajs:module-consumer` anchor at the end of the `defineModule({ ... })` call. Same anchor added to `examples/basic/posts` and all five `examples/showcase` modules so `katajs add queue --in <module>` works against any of them.

  9 new tests in `@katajs/cli` (file generation, anchor mutation, casing derivation, `--binding` override, `--dlq` field, `--batch` mode, refusal on existing file, missing-module rejection, anchor-fallback graceful behaviour). Workspace total: 148 passing.

- 3e00f64: Initial public release of katajs — an opinionated framework for Hono on Cloudflare Workers.

  **`@katajs/core`** — runtime: `defineModule`, `createApp`, request-scoped DI container with lazy resolution and cycle detection, `validate()` Zod wrapper preserving Hono RPC types, `AppError` + `errorMapper`, static `inspectModules()` graph inspector, `@katajs/core/testing` helper. Strict registry typing — typos in `requires` and `c.var.resolve()` are TypeScript errors.

  **`@katajs/drizzle`** — Drizzle adapter with Cloudflare Hyperdrive Postgres support and `withTransaction` that wires transaction-bound services through a sub-container.

  **`create-katajs`** — scaffolding CLI. `pnpm create katajs my-app` produces a single-API Workers project with one example module, Drizzle + Hyperdrive wired up, and `--auth` for Better Auth integration.

- 0bcb800: **`create-katajs --monorepo --auth`** — Phase 2 of the monorepo scaffolder. Better Auth is now extracted into a workspace package alongside the auth tables and a thin module that wraps the routes.

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

- 7489ea8: **`create-katajs --monorepo`** — Phase 1 of the monorepo scaffolder. Produces a pnpm + Turbo workspace with three packages and one app:

  - `apps/api/` — the Hono + Cloudflare Workers app (mirrors the single-API shape minus the local `db/` folder).
  - `packages/db/` — Drizzle schema, migrations, and `drizzle.config.ts`. Apps consume it as `@<project>/db`.
  - `packages/api-client/` — generic typed Hono RPC client factory. Generic over `AppType` so the package has zero workspace coupling — consumers bring their own `import type { AppType } from '@<project>/api'`.
  - Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.github/workflows/deploy.yml`.

  Internal packages use TypeScript source resolution (no build step). Turbo orchestrates `dev`, `test`, `typecheck`, and `deploy` tasks.

  Phase 1 limits:

  - `--auth + --monorepo` not yet supported (warns and continues without auth scaffolding).
  - `katajs add module/service/route` only walks up to find `@katajs/core` — running from the monorepo root won't find `apps/api/` automatically yet (run from `apps/api/` for now).

  Phase 2 (next): auth extraction into `packages/auth/`, root-level `katajs add` support, queue-consumer `apps/worker/` companion.

- 4135e24: **`create-katajs --monorepo --worker`** — adds an `apps/worker/` queue-consumer Worker to the monorepo, deployable independently from `apps/api`.

  The shape:

  ```
  my-app/
  ├── apps/
  │   ├── api/                            ← HTTP API (existing)
  │   └── worker/                         ← NEW: queue-only Worker
  │       ├── package.json                ← @<project>/worker, depends on @<project>/db
  │       ├── wrangler.jsonc              ← consumer-only config (no fetch)
  │       └── src/
  │           ├── index.ts                ← export default { queue }
  │           ├── app.ts                  ← createApp returns just `queue`
  │           ├── types.d.ts              ← Registry composition
  │           └── modules/
  │               └── example-consumer/   ← scaffolded starter consumer module
  │                   ├── index.ts
  │                   ├── example.consumer.ts
  │                   └── example.service.ts
  └── packages/
      ├── db/                             ← shared (api + worker both use)
      ├── auth/                           ← shared (when --auth)
      └── api-client/                     ← shared
  ```

  Producers and consumers stay decoupled: `apps/api` produces messages via `c.env.QUEUE.send(...)`; `apps/worker` consumes them through its own consumer modules. Each app owns its own modules — **no shared module package**. The two apps communicate only through (1) the queue itself and (2) the shared Drizzle schema in `packages/db`.

  If you want to share queue message schemas between the producer and consumer, the recommended pattern is to extract them into a small `packages/events/` package. Not scaffolded by default — keep things simple, add it when you actually need it.

  Implementation:

  - New `templates/monorepo-worker/` template tree (11 files).
  - `--worker` flag on `create-katajs`. Requires `--monorepo`; throws otherwise.
  - Interactive prompt added: when `--monorepo` is selected and `--worker` isn't explicit, asks "Include a queue worker app?".
  - Root `package.json` augmented with `deploy:api`, `deploy:worker`, and a combined `deploy` script.
  - The worker's `app.ts` calls `createApp({ ...modules })` without a `routes` callback — `createApp` returns `{ queue }` and the Worker default-exports `{ queue }`. No `fetch` handler needed.

  Type fix in `@katajs/core`: the `Module.consumer?: ConsumerSpec` field type changed to `ConsumerSpec<any>`. Reason: `ConsumerSpec<TBody>` is bivariant on `TBody` (schema is covariant on output, handle is contravariant on input), so `ConsumerSpec<{id: string}>` wasn't assignable to `ConsumerSpec<unknown>` (the default). Using `any` here lets a module's `consumer` field hold a typed consumer spec without the user having to widen at the call site. The consumer's own typing is preserved when accessed.

  6 new tests covering: file generation, project-name substitution, queue-only shape (no `fetch:`, no `routes:`), root scripts mutation, `--worker` without `--monorepo` throws, generated consumer uses `defineConsumer`. Workspace total: 161 passing.

  End-to-end verified: scaffolded both `--monorepo --worker` and `--monorepo --worker --auth` to temp dirs, installed with workspace overrides, `pnpm typecheck` clean across all 4–5 packages.

- 8296502: **Cloudflare Queues integration (Phase 1)** — modules can declare a `consumer:` field; `createApp` returns the queue handler alongside the Hono app.

  ```ts
  const { app, queue } = createApp({ ... });
  export default { fetch: app.fetch, queue };
  ```

  In `@katajs/core`:

  - New `ConsumerSpec` type, discriminated on `handle` (per-message) vs `handleBatch` (batch). Mutually exclusive at the type level. Optional `dlq` (binding name) and `maxRetries` (default 3).
  - `defineModule` extended to accept `consumer:` on both routed and services-only modules. A module can own routes, a consumer, both, or neither.
  - New per-message container construction shared with HTTP via `buildContainer` in `container.ts`. Queue containers use the message ID as `requestId`. The Hono Context is replaced with a stub that throws on access (queue handlers don't have an HTTP context — clear failure if a service tries to read `c.req`).
  - `buildQueueHandler` walks modules with `consumer:`, dispatches by binding name, validates with the schema, auto-acks on success, auto-retries on throw. After `maxRetries` attempts, sends a wrapped envelope to the DLQ binding (if configured) and acks the original — or just acks (drops) if no DLQ. Validation failures route through the same DLQ machinery.
  - New `queueErrorMapper` config on `createApp` for queue-side `onUnhandled` (separate from HTTP `errorMapper`).
  - New exports: `QueueHandler`, `QueueErrorMapperOptions`, `ValidatedMessage`, `ValidatedBatch`, `ConsumerSpec`, `ConsumerHandler`, `ConsumerBatchHandler`, `MessageSchema`.

  Scaffolder templates (`create-katajs`):

  - API + monorepo `apps/api` templates: Worker default export switched to `{ fetch: app.fetch, queue }` (queue is undefined when no module has a consumer; CF Workers handles that fine — forward-compatible with adding consumers later).
  - `wrangler.jsonc` ships with commented-out queue producer/consumer/DLQ binding examples.

  Tests: 16 new queue dispatch tests in `@katajs/core` (success ack, throw retry, DLQ routing, validation failure handling, batch handler, multi-queue dispatch, container scoping, duplicate-consumer detection). Workspace total: 139 passing.

  Out of scope for Phase 1 (deferred):

  - `@katajs/queues` package with typed producer wrappers (`c.var.resolve('queues').orders.send(...)`).
  - `katajs add queue <name>` CLI command.
  - Monorepo `apps/worker/` companion (requires modules in `packages/`).

- 6d74447: **Typed producer wrapper for queues.** `createApp({ queues: { name: { binding, schema } } })` declares producer manifests. Each entry surfaces as `c.var.queues.<name>.send(body)` — validated against the schema before delegating to `c.env[binding].send(...)`.

  ```ts
  const { app, queue } = createApp({
    modules: [...],
    queues: {
      orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
    },
  });

  // Anywhere with c access:
  await c.var.queues.orders.send({ type: 'order.placed', orderId: '...' });
  //                              ↑ typed against z.infer<typeof OrderEventSchema>
  //                              ↑ throws ValidationError synchronously on bad body
  ```

  **Producer and consumer are explicitly independent.** A module's `consumer:` field declares the consumer side (already shipped). The new `createApp({ queues })` declares the producer side. They share schemas by TypeScript import, not by framework wiring. This means:

  - Single-Worker apps declare both halves (consumer on module, producer in createApp); both import the same schema.
  - `apps/api` in a monorepo can declare producer-only (consumer lives in `apps/worker`).
  - `apps/worker` declares consumer-only (no `queues:` block in createApp).

  In `@katajs/core`:

  - New `TypedQueue<TBody>` interface with `send(body, options?)` and `sendBatch(bodies, options?)`.
  - New augmentable `QueuesRegistry` interface (mirrors `Registry` pattern).
  - New `QueueDeclaration<TBody>` type for `createApp.queues` entries.
  - New `SendOptions` and `SendBatchOptions` types.
  - Container middleware reads the queues config and builds `c.var.queues` per request. Each `send` validates with the schema; throws `ValidationError` (which the existing HTTP `errorMapper` renders as 400 if it bubbles up unhandled).
  - `RequestVariables` gains a `queues: QueuesRegistry` field.
  - `sendBatch` uses Cloudflare's native `Queue.sendBatch` when available, falls back to per-message `send` otherwise.

  In CLI (`katajs add queue`):

  - Adds the producer manifest entry to `createApp({ queues })` via a new `// katajs:queues` anchor.
  - Adds the `QueuesRegistry` augmentation entry to `types.d.ts` via a new `// katajs:queues-registry` anchor.
  - Imports the schema (already exported from the generated consumer file) into both `app.ts` and `types.d.ts`.
  - New `--no-producer` flag for consumer-only scaffolding (apps/worker).

  Templates updated:

  - `templates/api/src/app.ts`, `templates/monorepo/apps/api/src/app.ts`, `examples/basic/src/app.ts`: ship with `queues: { /* katajs:queues */ }` block in createApp.
  - `templates/api/src/types.d.ts`, `templates/monorepo/apps/api/src/types.d.ts`, `examples/basic/src/types.d.ts`: ship with `interface QueuesRegistry { /* katajs:queues-registry */ }` augmentation.

  Tests: 8 new in `@katajs/core` covering validate-on-send, multi-queue dispatch, sendBatch with and without binding-side support, missing-binding error, ValidationError catchable from user code. Workspace total: 172 passing.

  End-to-end verified by scaffolding a project, running `katajs add queue orders --in posts`, installing with workspace overrides, `pnpm typecheck` clean.

### Patch Changes

- Updated dependencies [509cf60]
- Updated dependencies [fd7ad5d]
- Updated dependencies [3e00f64]
- Updated dependencies [0bcb800]
- Updated dependencies [7489ea8]
- Updated dependencies [4135e24]
- Updated dependencies [8296502]
- Updated dependencies [6d74447]
  - @katajs/core@1.0.0
