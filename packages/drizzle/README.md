# @katajs/drizzle

Drizzle adapter for [Kata](https://github.com/ookino/katajs) — wires [Drizzle ORM](https://orm.drizzle.team) to [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/) for Postgres, via [postgres.js](https://github.com/porsager/postgres) (`drizzle-orm/postgres-js`).

```bash
pnpm add @katajs/drizzle drizzle-orm postgres
```

Requires `compatibility_flags: ["nodejs_compat"]` in `wrangler.jsonc` — postgres.js opens a TCP connection through Hyperdrive.

## Usage

```ts
import { createApp } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from './db/schema';

type Bindings = {
  HYPERDRIVE: Hyperdrive;
};

const { app } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [/* ... */],
});
```

`drizzleAdapter` returns a `DbAdapter` that Kata's container middleware uses to construct a per-request `db` client backed by `env.HYPERDRIVE.connectionString`. By default it builds the postgres.js client with Cloudflare's recommended Hyperdrive settings — a small local pool (`max: 5`, since Hyperdrive does its own pooling) and `fetch_types: false` (skips the type-OID round trip; Drizzle infers column types from your schema). Pass `clientOptions` to override:

```ts
db: drizzleAdapter({ schema, clientOptions: { max: 10, idle_timeout: 20 } }),
```

For tests, pass `makeClient` to inject a fake client and skip the binding lookup entirely.

## Transactions

```ts
// inside a service
async create(input: CreatePostInput) {
  return c.withTransaction(async (tx) => {
    const post = await tx.resolve('postRepository').insert(input);
    await tx.resolve('auditService').log({ action: 'post.create', id: post.id });
    return post;
  });
}
```

`withTransaction` wraps `db.transaction(...)` and rebuilds a sub-container where every repository uses the transaction-bound `tx` client. Non-repository services are reused from the outer container. Nested calls reuse the outer transaction (no savepoints in v0.1).

## Public API

```ts
export { drizzleAdapter } from '@katajs/drizzle';
export type {
  DrizzleAdapterConfig,
  DrizzleClient,
  DrizzleClientOrTx,
  DrizzleTx,
  HyperdriveBinding,
  PostgresClientOptions,
} from '@katajs/drizzle';
```

## Local development

When developing locally with `wrangler dev`, configure `wrangler.jsonc` with a `localConnectionString` for the Hyperdrive binding:

```jsonc
{
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<your-hyperdrive-id>",
      "localConnectionString": "postgres://postgres:postgres@localhost:5432/myapp"
    }
  ]
}
```

The binding `id` is required even locally; use any UUID until you've created the real Hyperdrive resource.

## License

[MIT](./LICENSE) © Yaseer A. Okino
