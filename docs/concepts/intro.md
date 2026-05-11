# Intro: what is katajs?

katajs is a small opinionated framework for building backend services with [Hono](https://hono.dev) on [Cloudflare Workers](https://developers.cloudflare.com/workers/). It gives you one shape for organizing code, one way to validate input, one way to handle errors, and one way to share dependencies across a request.

## What it is

A thin runtime that composes well-established tools into a consistent project structure:

- **Hono** is the HTTP layer. katajs doesn't replace it; every route is still a Hono route, every middleware is still Hono middleware, and the `hc<AppType>()` RPC client works exactly as documented.
- **Zod** is the validation layer. `validate({ body, query, param })` is a wrapper around `@hono/zod-validator` that throws a typed `ValidationError` on failure.
- **Drizzle** is the ORM. The `@katajs/drizzle` adapter wires it through Cloudflare Hyperdrive.
- **Cloudflare Workers** is the deploy target. Wrangler, Hyperdrive, Queues, Durable Objects, R2, KV — all native.

What katajs *adds* is the wiring: a module concept, a per-request DI container, a Registry that gives strict autocomplete on services, and a `createApp` orchestrator that boot-validates the dependency graph.

## What it is not

- **Not multi-runtime.** katajs is Cloudflare Workers first. The runtime package is internally agnostic, but the templates, CLI, devtools, and ecosystem packages are Workers-shaped.
- **Not a Hono replacement.** If a problem can be solved with Hono alone, solve it with Hono. katajs only earns its weight when you have multiple modules sharing services.
- **Not class-based.** No decorators, no `reflect-metadata`, no `@Injectable()`. Modules are plain objects from a `defineModule(...)` call.
- **Not a buffet.** There's one way to organize a module, one way to mount routes, one way to compose services. Opinionated by design — pick a different framework if you want to choose your own structure.

## Who it's for

You'll probably like katajs if:

- You're building a backend service on Cloudflare Workers with Postgres (Hyperdrive).
- You want explicit module boundaries with explicit cross-module dependencies, validated at boot.
- You want every project to start the same way, so you stop reinventing the wiring layer.
- You like Hono's minimalism but find yourself wanting more structure once a project grows past a few modules.

You'll probably *not* like katajs if:

- You want a framework with no opinions (use Hono directly).
- You want a framework that does everything (use NestJS or t3).
- You want decorator-based DI or class-based services (we don't ship that and won't).
- You're targeting Node, Bun, or Deno and won't be on Workers (use a different framework).

## How big is it?

The runtime is ~600 lines of TypeScript. The Drizzle adapter is ~80 lines. The CLI is ~250 lines plus templates. Most of the code you ship is *your code* — katajs is a small layer between you and Hono.

## How does the rest of the doc set fit together?

- **[Modules](./modules.md)** — the unit of organization. What `provides`/`requires` mean and how routed/services-only modules differ.
- **[Container](./container.md)** — request-scoped DI. How `c.var.resolve(key)` works, what's lazy, what's strict.
- **[Registry](./registry.md)** — TypeScript module augmentation. How each module's slice composes into the global Registry that powers strict autocomplete.
- **[Routes](./routes.md)** — how routes mount, where free-floating routes live, how Hono RPC types flow through `createApp`.
- **[Validation](./validation.md)** — `validate({ body, query, param })`, how Zod errors become structured 400 responses.
- **[Errors](./errors.md)** — `AppError` subclasses, `errorMapper`, the response shape.
- **[Transactions](./transactions.md)** — `withTransaction`, repository pattern, cross-module atomicity.
- **[Databases](./databases.md)** — one database or many; `c.db` as a client or a named map; the `katajs add database` codemod.
- **[Testing](./testing.md)** — `makeTestContainer` for unit tests, real Postgres for integration tests.
- **[Devtools](./devtools.md)** — the static module graph (Shape A) and the live interactive devtools UI (Shape B).
- **[Architecture](./architecture.md)** — when to split modules, when to graduate to `--monorepo`.

## Quickstart

```bash
pnpm create katajs my-app
cd my-app
pnpm dev
```

Open `src/modules/posts/` to see the example module. Open `src/app.ts` to see how it's wired in. That's enough to start.
