import { betterAuth } from 'better-auth';
import { drizzleAdapter as betterAuthDrizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DrizzleClient } from '@katajs/drizzle';
import * as schema from '../../db/schema';

/**
 * Build a Better Auth instance bound to the request-scoped Drizzle client.
 *
 * Note: Better Auth has its *own* `drizzleAdapter` (imported as
 * `betterAuthDrizzleAdapter`) — distinct from `@katajs/drizzle`'s
 * `drizzleAdapter`. The naming overlap is unavoidable.
 */
export function makeAuth(db: DrizzleClient<typeof schema>, env: { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string }) {
  return betterAuth({
    database: betterAuthDrizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
  });
}

export type AuthInstance = ReturnType<typeof makeAuth>;
