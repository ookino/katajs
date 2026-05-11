/**
 * Adapter contract for the database layer. `create` is called once per request
 * to produce the per-request client; `runTransaction` (optional) runs a
 * callback inside a transaction with a transaction-bound client (`txDb`).
 *
 * The `db` / `txDb` types are intentionally loose (`any`) at the adapter
 * boundary because, e.g., Drizzle's client and transaction are different types
 * with the same query API. User code relies on the augmented `AppDb` interface
 * to type `c.db`, treating client and tx as interchangeable for repository code.
 */
export type DbAdapter = {
  create(env: unknown): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTransaction?<T>(db: any, fn: (txDb: any) => Promise<T>): Promise<T>;
};

/**
 * Internal key used for the single-database case. `createApp({ db: adapter })`
 * is normalized to `{ [DEFAULT_DB]: adapter }`, with `c.db` exposed as the
 * client directly (not the map). Users never see this key.
 */
export const DEFAULT_DB = '__default__';

/**
 * The per-request database layer, normalized. Both the HTTP and queue paths
 * build one of these and hand it to `buildContainer`.
 *
 * - `clients` is always a map of name → constructed client, even single-db.
 * - `adapters` is the matching map of name → adapter (for `runTransaction`).
 * - `multi` is true when the user passed `db: { ... }` rather than `db: adapter`.
 *   It determines `c.db`'s shape and which `withTransaction` overload applies.
 * - `view` is what `c.db` returns: the single client (single-db) or the
 *   `clients` map (multi-db).
 */
export type DbBundle = {
  readonly clients: Record<string, unknown>;
  readonly adapters: Record<string, DbAdapter>;
  readonly multi: boolean;
  readonly view: unknown;
};

/** True if `x` looks like a `DbAdapter` (has a `create` method). */
export function isDbAdapter(x: unknown): x is DbAdapter {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { create?: unknown }).create === 'function'
  );
}

/**
 * Build a `DbBundle` from `createApp`'s `db` config (a single adapter or a map
 * of named adapters) and the runtime `env`. Constructs every client eagerly —
 * postgres.js / Drizzle clients are cheap to build and connect lazily.
 */
export function buildDbBundle(
  db: DbAdapter | Record<string, DbAdapter>,
  env: unknown,
): DbBundle {
  if (isDbAdapter(db)) {
    const client = db.create(env);
    return {
      clients: { [DEFAULT_DB]: client },
      adapters: { [DEFAULT_DB]: db },
      multi: false,
      view: client,
    };
  }
  const names = Object.keys(db);
  if (names.length === 0) {
    throw new Error(
      "[katajs] createApp({ db: {} }) — the database map is empty. Pass a single " +
        'adapter (`db: drizzleAdapter(...)`) or at least one named entry.',
    );
  }
  const clients: Record<string, unknown> = {};
  for (const name of names) clients[name] = db[name]!.create(env);
  return { clients, adapters: db, multi: true, view: clients };
}

/**
 * Return a copy of `bundle` with the named client swapped for a
 * transaction-bound one. Used by `withTransaction` to build the sub-container:
 * the named db points at the tx handle, every other db is unchanged (there are
 * no cross-database transactions).
 */
export function withTxClient(
  bundle: DbBundle,
  name: string,
  txClient: unknown,
): DbBundle {
  const clients = { ...bundle.clients, [name]: txClient };
  return {
    clients,
    adapters: bundle.adapters,
    multi: bundle.multi,
    view: bundle.multi ? clients : clients[name],
  };
}
