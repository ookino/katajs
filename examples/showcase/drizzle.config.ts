import { defineConfig } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/katajs_showcase_test';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
});
