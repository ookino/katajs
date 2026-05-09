import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DrizzleClient, DrizzleTx } from './types';

/** Cloudflare Hyperdrive binding shape (per `env.HYPERDRIVE`). */
export type HyperdriveBinding = {
  connectionString: string;
};

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
   * Inject a custom client factory. When provided, `bindingName` is ignored.
   * Primarily for tests; production code should let the adapter build the pool.
   */
  makeClient?: (env: unknown) => DrizzleClient<TSchema>;
};

/**
 * Drizzle adapter targeting Cloudflare Hyperdrive (Postgres). Per spec §6.2
 * uses `pg` (`node-postgres`) with `nodejs_compat`.
 *
 *   const { app } = createApp({
 *     bindings: {} as Bindings,
 *     db: drizzleAdapter({ schema }),
 *     modules: [...],
 *   });
 */
export function drizzleAdapter<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(config: DrizzleAdapterConfig<TSchema> = {}) {
  const bindingName = config.bindingName ?? 'HYPERDRIVE';

  return {
    create(env: unknown): DrizzleClient<TSchema> {
      if (config.makeClient) return config.makeClient(env);

      const binding = (env as Record<string, unknown> | null | undefined)?.[
        bindingName
      ] as HyperdriveBinding | undefined;

      if (!binding?.connectionString) {
        throw new Error(
          `[katajs] Missing '${bindingName}' binding or its connectionString. ` +
            `Add a Hyperdrive binding to wrangler.jsonc, or pass 'makeClient' for tests.`,
        );
      }

      const pool = new Pool({ connectionString: binding.connectionString });
      return drizzle(pool, { schema: config.schema }) as DrizzleClient<TSchema>;
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
