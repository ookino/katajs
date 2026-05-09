# {{PROJECT_NAME}}

Scaffolded with [`create-katajs`](https://github.com/yasr/katajs).

## Setup

```sh
pnpm install
```

Spin up a local Postgres for development (Docker example):

```sh
docker run -d --name {{PROJECT_NAME}}-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB={{PROJECT_NAME}}_dev \
  -p 5432:5432 \
  postgres:16
```

Copy `.dev.vars.example` to `.dev.vars` (for `wrangler dev`).

## Develop

```sh
pnpm db:generate   # generate Drizzle migrations after schema changes
pnpm db:migrate    # apply migrations to your dev Postgres
pnpm dev           # wrangler dev
```

`wrangler dev` connects directly to the Postgres URL in `.dev.vars` (or
`localConnectionString` in `wrangler.jsonc`). Hyperdrive's pooling/caching
applies on Cloudflare's edge in production; locally you get a transparent
passthrough.

## Module graph

```sh
pnpm graph
# writes graph.html — open in any browser
```

Generates a self-contained HTML page showing your modules, their dependency
edges, and a flat routes table. Useful for reviewing your app's structure or
embedding in PR descriptions. Regenerate after structural changes.

## Type-safe clients with Hono RPC

`AppType` is exported from `src/app.ts`. Consume it from another package:

```ts
import { hc } from 'hono/client';
import type { AppType } from '<your-api-package>';

const client = hc<AppType>('https://api.example.com');
const res = await client.posts.$post({ json: { title: 'Hi', body: 'Hello' } });
```

## Adding tests

If you add unit tests with synthetic services (e.g. test fixtures that
augment `@katajs/core`'s `Registry` with throwaway service keys), keep them
in their own tsconfig so test-only augmentations don't pollute editor
autocomplete in `src/`. TypeScript module augmentations are global per
program — splitting the program is the only fix.

Pattern:

```jsonc
// tsconfig.json — for editor + `pnpm typecheck`
{ "include": ["src/**/*"] }

// tsconfig.test.json — for `pnpm test:typecheck`
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*", "test/**/*"]
}
```

Run both in your `typecheck` script:
```json
"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json"
```

## Deploy

CI pushes to `main` deploy via the included workflow. Locally:

```sh
pnpm deploy
```

You'll need `CLOUDFLARE_API_TOKEN` in CI secrets and a real Hyperdrive
configuration before the first deploy. See
[Cloudflare Hyperdrive docs](https://developers.cloudflare.com/hyperdrive).
