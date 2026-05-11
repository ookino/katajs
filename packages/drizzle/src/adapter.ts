import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getHyperdriveBinding } from './shared';
import type { DrizzleClient, DrizzleTx } from './types';

export type { HyperdriveBinding } from './shared';

/** postgres.js client options — the second arg to `postgres(connectionString, ...)`. */
export type PostgresClientOptions = Parameters<typeof postgres>[1];

export type DrizzleAdapterConfig<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = {
  /** Drizzle relational schema. Required for `db.query.<table>` API. */
  schema?: TSchema;
  /**
   * Override the Hyperdrive binding key on `env`. Default `HYPERDRIVE`.
   * Useful when a project uses multiple bindings or a non-conventional name.
   */
  bindingName?: string;
  /**
   * Extra options for `postgres(connectionString, options)`. Merged over the
   * Workers-sensible defaults (`max: 5`, `fetch_types: false`).
   */
  clientOptions?: PostgresClientOptions;
  /**
   * Inject a custom client factory. When provided, `bindingName` and
   * `clientOptions` are ignored. Primarily for tests; production code should
   * let the adapter build the client.
   */
  makeClient?: (env: unknown) => DrizzleClient<TSchema>;
};

/**
 * Drizzle adapter targeting Cloudflare Hyperdrive (Postgres) via postgres.js
 * (`drizzle-orm/postgres-js`). Requires `compatibility_flags: ["nodejs_compat"]`
 * in wrangler — postgres.js opens a TCP connection through Hyperdrive.
 *
 *   const { app } = createApp({
 *     bindings: {} as Bindings,
 *     db: drizzleAdapter({ schema }),
 *     modules: [...],
 *   });
 *
 * For MySQL on Hyperdrive use `drizzleMysqlAdapter` from `@katajs/drizzle/mysql`.
 *
 * Defaults follow Cloudflare's Hyperdrive guidance: a small local pool
 * (`max: 5`) since Hyperdrive does its own pooling, and `fetch_types: false`
 * to skip the type-OID round trip on connect (Drizzle infers column types
 * from your schema, so it doesn't need postgres.js's runtime type catalog).
 */
export function drizzleAdapter<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(config: DrizzleAdapterConfig<TSchema> = {}) {
  const bindingName = config.bindingName ?? 'HYPERDRIVE';

  return {
    create(env: unknown): DrizzleClient<TSchema> {
      if (config.makeClient) return config.makeClient(env);

      const { connectionString } = getHyperdriveBinding(env, bindingName);
      const client = postgres(connectionString, {
        max: 5,
        fetch_types: false,
        ...config.clientOptions,
      });
      return drizzle(client, { schema: config.schema }) as DrizzleClient<TSchema>;
    },

    /**
     * Run a function inside a Drizzle transaction. Surfaces the txDb to the
     * caller via Drizzle's native `db.transaction(...)`. v0.1 has no
     * savepoints — nested calls reuse the outer transaction (handled by core).
     */
    async runTransaction<T>(
      db: DrizzleClient<TSchema>,
      fn: (txDb: DrizzleTx<TSchema>) => Promise<T>,
    ): Promise<T> {
      return db.transaction(async (txDb) => fn(txDb as DrizzleTx<TSchema>));
    },
  };
}
