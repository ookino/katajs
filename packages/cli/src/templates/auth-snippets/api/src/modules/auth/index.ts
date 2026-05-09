import { defineModule } from '@katajs/core';
import * as schema from '../../db/schema';
import type { DrizzleClient } from '@katajs/drizzle';
import { makeAuth, type AuthInstance } from './auth.config';
import { authRoutes } from './auth.routes';

export const authModule = defineModule({
  name: 'auth',
  provides: {
    authInstance: (c): AuthInstance =>
      makeAuth(
        c.db as DrizzleClient<typeof schema>,
        c.env as { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string },
      ),
  },
  requires: [] as const,
  routes: authRoutes,
  prefix: '/auth',
});

/** Services this module contributes to the container's `Registry`. */
export type AuthRegistry = {
  authInstance: AuthInstance;
};

export type { AuthInstance } from './auth.config';
export { UnauthorizedError } from './auth.errors';
export { attachUserMiddleware, requireAuthMiddleware } from './auth.middleware';
