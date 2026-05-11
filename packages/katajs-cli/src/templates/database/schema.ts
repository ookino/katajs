import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the `{{kebab}}` database.
 *
 * This database is wired in `src/app.ts` under `db.{{camel}}` and reachable
 * as `c.db.{{camel}}` (or `c.var.db.{{camel}}`). Run migrations against it with
 * a Drizzle Kit config pointed at this file — see drizzle.config.ts.
 *
 * The table below is a placeholder. Replace it with your real schema.
 */
export const {{camel}}Items = pgTable('{{snake}}_items', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
