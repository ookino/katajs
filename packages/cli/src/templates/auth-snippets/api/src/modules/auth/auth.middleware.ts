import { defineMiddleware } from '@katajs/core';
import type { AuthInstance } from './auth.config';
import { UnauthorizedError } from './auth.errors';

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser;
  }
}

/**
 * Attach the current user (if any) to `c.var.user`. Routes that require auth
 * should use `requireAuthMiddleware` instead.
 */
export const attachUserMiddleware = (auth: AuthInstance) =>
  defineMiddleware(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      c.set('user', session.user as SessionUser);
    }
    await next();
  });

/** Require an authenticated user — throws `UnauthorizedError` if absent. */
export const requireAuthMiddleware = (auth: AuthInstance) =>
  defineMiddleware(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) throw new UnauthorizedError();
    c.set('user', session.user as SessionUser);
    await next();
  });
