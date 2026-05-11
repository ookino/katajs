import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** Drizzle client bound to postgres.js against a Hyperdrive connection. */
export type DrizzleClient<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = PostgresJsDatabase<TSchema>;

/** Drizzle transaction handle (same query API as the client). */
export type DrizzleTx<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = PgTransaction<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

export type DrizzleClientOrTx<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = DrizzleClient<TSchema> | DrizzleTx<TSchema>;
