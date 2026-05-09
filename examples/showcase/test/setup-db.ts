import { Client } from 'pg';

export const TEST_DB_URL =
  process.env.KATAJS_TEST_PG_URL ?? 'postgres://postgres@localhost:5432/katajs_showcase_test';

const DDL = `
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS posts CASCADE;

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** Apply the test schema. Idempotent — drops + recreates tables. */
export async function applyTestSchema(): Promise<void> {
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  try {
    await client.query(DDL);
  } finally {
    await client.end();
  }
}

/** Empty all tables. Faster than re-applying DDL between tests. */
export async function truncateAll(): Promise<void> {
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  try {
    await client.query(
      'TRUNCATE comments, users, audit_log, events, posts RESTART IDENTITY CASCADE',
    );
  } finally {
    await client.end();
  }
}
