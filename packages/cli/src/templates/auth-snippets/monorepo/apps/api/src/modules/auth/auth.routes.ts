import { Hono } from 'hono';
import type { AppEnv } from '../../app';

export const authRoutes = new Hono<AppEnv>().all('/*', async (c) => {
  const auth = c.var.container.resolve('authInstance');
  return auth.handler(c.req.raw);
});
