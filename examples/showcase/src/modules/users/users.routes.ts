import { Hono } from 'hono';
import { validate } from '@katajs/core';
import type { AppEnv } from '../../app';
import { CreateUserSchema, ListUsersQuery, UserIdParam } from './users.schema';

export const usersRoutes = new Hono<AppEnv>()
  .get('/', ...validate({ query: ListUsersQuery }), async (c) => {
    const query = c.req.valid('query');
    const service = c.var.resolve('userService');
    const users = await service.list(query);
    return c.json({ users });
  })
  .get('/:id', ...validate({ param: UserIdParam }), async (c) => {
    const { id } = c.req.valid('param');
    const service = c.var.resolve('userService');
    const user = await service.getById(id);
    return c.json({ user });
  })
  .post('/', ...validate({ body: CreateUserSchema }), async (c) => {
    const input = c.req.valid('json');
    const service = c.var.resolve('userService');
    const user = await service.create(input);
    return c.json({ user }, 201);
  });
