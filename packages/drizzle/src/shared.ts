/**
 * Bits shared between the Hyperdrive-backed adapters (`drizzleAdapter` for
 * Postgres, `drizzleMysqlAdapter` for MySQL). This module imports no database
 * driver, so pulling it into a dialect-specific entry point doesn't drag the
 * other driver along.
 */

/** Cloudflare Hyperdrive binding shape (per `env.HYPERDRIVE`). */
export type HyperdriveBinding = {
  connectionString: string;
};

/**
 * Look up a Hyperdrive binding on `env` by name and validate it has a
 * connection string. Throws a clear error if the binding is missing — the
 * usual cause is a forgotten `hyperdrive` entry in `wrangler.jsonc`.
 */
export function getHyperdriveBinding(env: unknown, bindingName: string): HyperdriveBinding {
  const binding = (env as Record<string, unknown> | null | undefined)?.[
    bindingName
  ] as HyperdriveBinding | undefined;
  if (!binding?.connectionString) {
    throw new Error(
      `[katajs] Missing '${bindingName}' binding or its connectionString. ` +
        `Add a Hyperdrive binding to wrangler.jsonc, or pass 'makeClient' for tests.`,
    );
  }
  return binding;
}
