import { Hono } from 'hono';
import type { AppEnv } from '../../app';

export const {{camel}}Routes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const service = c.var.resolve('{{camel}}Service');
    const result = await service.ping();
    return c.json(result);
  })
  // katajs:module-routes
  ;
