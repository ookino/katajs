import { defineModule } from '@katajs/core';
import * as schema from '@{{PROJECT_NAME}}/db';
import type { DrizzleClient } from '@katajs/drizzle';
import { createAuth, type AuthInstance } from '@{{PROJECT_NAME}}/auth';
import { authRoutes } from './auth.routes';

export const authModule = defineModule({
  name: 'auth',
  provides: {
    authInstance: (c): AuthInstance =>
      createAuth(
        c.db as DrizzleClient<typeof schema>,
        c.env as { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string },
      ),
  },
  requires: [] as const,
  routes: authRoutes,
  prefix: '/auth',
  // katajs:module-consumer
});

/** Services this module contributes to the container's `Registry`. */
export type AuthRegistry = {
  authInstance: AuthInstance;
};

export type { AuthInstance } from '@{{PROJECT_NAME}}/auth';
export { UnauthorizedError } from './auth.errors';
export { attachUserMiddleware, requireAuthMiddleware } from './auth.middleware';
