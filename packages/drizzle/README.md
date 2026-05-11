# @katajs/drizzle

Drizzle adapter for [Kata](https://github.com/ookino/katajs) — wires [Drizzle ORM](https://orm.drizzle.team) to [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/) for **Postgres** (via [postgres.js](https://github.com/porsager/postgres), `drizzle-orm/postgres-js`) and **MySQL** (via [mysql2](https://github.com/sidorares/node-mysql2), `drizzle-orm/mysql2`).

Two entry points, one per dialect — pick the one(s) you need:

```bash
# Postgres on Hyperdrive
pnpm add @katajs/drizzle drizzle-orm postgres

# MySQL on Hyperdrive
pnpm add @katajs/drizzle drizzle-orm mysql2
```

Both require `compatibility_flags: ["nodejs_compat"]` in `wrangler.jsonc` — the driver opens a TCP connection through Hyperdrive.

## Postgres — `drizzleAdapter`

```ts
import { createApp } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from './db/schema';

type Bindings = { HYPERDRIVE: Hyperdrive };

const { app } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [/* ... */],
});
```

`drizzleAdapter` builds a per-request postgres.js client backed by `env.HYPERDRIVE.connectionString`. Defaults follow Cloudflare's Hyperdrive guidance — a small local pool (`max: 5`, since Hyperdrive does its own pooling) and `fetch_types: false` (skips the type-OID round trip; Drizzle infers column types from your schema). Override via `clientOptions`:

```ts
db: drizzleAdapter({ schema, clientOptions: { max: 10, idle_timeout: 20 } }),
```

## MySQL — `drizzleMysqlAdapter`

```ts
import { createApp } from '@katajs/core';
import { drizzleMysqlAdapter } from '@katajs/drizzle/mysql';
import * as schema from './db/schema';

type Bindings = { HYPERDRIVE: Hyperdrive };

const { app } = createApp({
  bindings: {} as Bindings,
  db: drizzleMysqlAdapter({ schema }),
  modules: [/* ... */],
});
```

`drizzleMysqlAdapter` builds a per-request `mysql2.createPool({ uri: connectionString, ... })` and wraps it with `drizzle-orm/mysql2`. Defaults:

- `connectionLimit: 5` — Hyperdrive pools upstream; keep the local pool small.
- `disableEval: true` — **required on Workers** since `mysql2` otherwise uses `eval()` for packet-parser codegen, which the Workers runtime forbids. Without this the first query throws.
- `mode: 'default'` (passed to Drizzle).

Override via `clientOptions`:

```ts
db: drizzleMysqlAdapter({ schema, clientOptions: { connectionLimit: 10 } }),
```

Augment `AppDb` with `DrizzleMysqlClient<typeof schema>` (single-db) or include it in your `AppDb` map (multi-db).

## Multiple databases

Both adapters slot into the [multi-database](https://github.com/ookino/katajs/blob/main/docs/concepts/databases.md) `db` map — single Worker, one Postgres + one MySQL:

```ts
import { drizzleAdapter } from '@katajs/drizzle';
import { drizzleMysqlAdapter } from '@katajs/drizzle/mysql';
import * as appSchema from './db/schema';
import * as legacySchema from './db/legacy-schema';

const { app } = createApp({
  db: {
    main: drizzleAdapter({ schema: appSchema }),
    legacy: drizzleMysqlAdapter({ schema: legacySchema, bindingName: 'LEGACY_HD' }),
  },
  modules: [/* ... */],
});

// c.db.main.query.posts.findFirst(...)
// c.db.legacy.query.legacyItems.findFirst(...)
// c.withTransaction('main', async (tx) => { ... })
// c.withTransaction('legacy', async (tx) => { ... })
```

Augment the `AppDb` interface to match:

```ts
import type { DrizzleClient } from '@katajs/drizzle';
import type { DrizzleMysqlClient } from '@katajs/drizzle/mysql';

declare module '@katajs/core' {
  interface AppDb {
    main: DrizzleClient<typeof appSchema>;
    legacy: DrizzleMysqlClient<typeof legacySchema>;
  }
}
```

## Transactions

```ts
async create(input: CreatePostInput) {
  return c.withTransaction(async (tx) => {
    const post = await tx.resolve('postRepository').insert(input);
    await tx.resolve('auditService').log({ action: 'post.create', id: post.id });
    return post;
  });
}
```

`withTransaction` wraps the driver's native `db.transaction(...)` and rebuilds a sub-container where every repository uses the transaction-bound `tx` client. Non-repository services are reused from the outer container. Nested calls reuse the outer transaction (no savepoints in v0.1). In a multi-database app, `withTransaction` takes a db name: `c.withTransaction('main', fn)` / `c.withTransaction('legacy', fn)` — only that db gets the transaction handle; the others stay non-transactional inside the callback.

## Tests

For tests, pass `makeClient` to inject a fake client and skip the binding lookup entirely:

```ts
import { drizzleAdapter } from '@katajs/drizzle';

const adapter = drizzleAdapter({ makeClient: () => fakeDb });
```

## Public API

```ts
// Postgres entry
export { drizzleAdapter } from '@katajs/drizzle';
export type {
  DrizzleAdapterConfig,
  DrizzleClient,
  DrizzleClientOrTx,
  DrizzleTx,
  HyperdriveBinding,
  PostgresClientOptions,
} from '@katajs/drizzle';

// MySQL entry
export { drizzleMysqlAdapter } from '@katajs/drizzle/mysql';
export type {
  DrizzleMysqlAdapterConfig,
  DrizzleMysqlClient,
  DrizzleMysqlClientOrTx,
  DrizzleMysqlTx,
  MysqlPoolOptions,
} from '@katajs/drizzle/mysql';
```

## Local development

For Postgres:

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

For MySQL the `localConnectionString` is `mysql://user:pass@localhost:3306/myapp`. The Hyperdrive `id` is required even locally; use any UUID until you've created the real Hyperdrive resource.

## License

[MIT](./LICENSE) © Yaseer A. Okino
