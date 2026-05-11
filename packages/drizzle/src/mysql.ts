import { drizzle } from 'drizzle-orm/mysql2';
import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';
import type {
  MySql2Database,
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
} from 'drizzle-orm/mysql2';
import type { MySqlTransaction } from 'drizzle-orm/mysql-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { getHyperdriveBinding } from './shared';

export type { HyperdriveBinding } from './shared';

/** Drizzle client bound to mysql2 against a Hyperdrive (MySQL) connection. */
export type DrizzleMysqlClient<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = MySql2Database<TSchema>;

/** Drizzle transaction handle for the mysql2 driver (same query API as the client). */
export type DrizzleMysqlTx<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = MySqlTransaction<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

export type DrizzleMysqlClientOrTx<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = DrizzleMysqlClient<TSchema> | DrizzleMysqlTx<TSchema>;

/** mysql2 pool options (the config object passed to `createPool`). */
export type MysqlPoolOptions = PoolOptions;

export type DrizzleMysqlAdapterConfig<
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
   * Extra options for `createPool({ uri, ...options })`. Merged over the
   * Workers-sensible defaults (`connectionLimit: 5`, `disableEval: true`).
   */
  clientOptions?: MysqlPoolOptions;
  /**
   * Inject a custom client factory. When provided, `bindingName` and
   * `clientOptions` are ignored. Primarily for tests; production code should
   * let the adapter build the pool.
   */
  makeClient?: (env: unknown) => DrizzleMysqlClient<TSchema>;
};

/**
 * Drizzle adapter targeting Cloudflare Hyperdrive (MySQL) via mysql2
 * (`drizzle-orm/mysql2`). Requires `compatibility_flags: ["nodejs_compat"]`
 * in wrangler — mysql2 opens a TCP connection through Hyperdrive.
 *
 *   import { drizzleMysqlAdapter } from '@katajs/drizzle/mysql';
 *
 *   const { app } = createApp({
 *     bindings: {} as Bindings,
 *     db: drizzleMysqlAdapter({ schema }),
 *     modules: [...],
 *   });
 *
 * In a multi-database app it slots into the `db` map like any other adapter:
 *
 *   db: {
 *     main: drizzleAdapter({ schema: pgSchema }),
 *     legacy: drizzleMysqlAdapter({ schema: mysqlSchema, bindingName: 'LEGACY_HD' }),
 *   }
 *
 * Defaults follow Cloudflare's Hyperdrive + mysql2 guidance:
 * - `connectionLimit: 5` — Hyperdrive does its own pooling; keep the local pool small.
 * - `disableEval: true` — mysql2 otherwise uses `eval()` for packet-parser
 *   codegen, which the Workers runtime forbids. Without this the first query throws.
 *
 * Augment `AppDb` with `DrizzleMysqlClient<typeof schema>` (single-db) or include
 * it in the `AppDb` map (multi-db) so `c.db` is typed.
 */
export function drizzleMysqlAdapter<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(config: DrizzleMysqlAdapterConfig<TSchema> = {}) {
  const bindingName = config.bindingName ?? 'HYPERDRIVE';

  return {
    create(env: unknown): DrizzleMysqlClient<TSchema> {
      if (config.makeClient) return config.makeClient(env);

      const { connectionString } = getHyperdriveBinding(env, bindingName);
      const pool: Pool = createPool({
        uri: connectionString,
        connectionLimit: 5,
        // Workers forbids eval(); mysql2 needs this since v3.
        disableEval: true,
        ...config.clientOptions,
      } as PoolOptions);
      return drizzle(pool, {
        schema: config.schema,
        mode: 'default',
      }) as unknown as DrizzleMysqlClient<TSchema>;
    },

    /**
     * Run a function inside a Drizzle transaction via the mysql2 driver's
     * native `db.transaction(...)`. Nested calls reuse the outer transaction
     * (handled by core — no savepoints in v0.1).
     */
    async runTransaction<T>(
      db: DrizzleMysqlClient<TSchema>,
      fn: (txDb: DrizzleMysqlTx<TSchema>) => Promise<T>,
    ): Promise<T> {
      return db.transaction(async (txDb) => fn(txDb as DrizzleMysqlTx<TSchema>));
    },
  };
}
