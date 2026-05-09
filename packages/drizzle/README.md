# @katajs/drizzle

Drizzle adapter for [katajs](https://github.com/ookino/katajs) — wires [Drizzle ORM](https://orm.drizzle.team) to [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/) for Postgres.

```bash
pnpm add @katajs/drizzle drizzle-orm pg
```

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

`drizzleAdapter` returns a `DbAdapter` that katajs's container middleware uses to construct a per-request `db` client backed by `env.HYPERDRIVE.connectionString`.

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
