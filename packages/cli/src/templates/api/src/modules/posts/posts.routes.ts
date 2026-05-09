import { Hono } from 'hono';
import { validate } from '@katajs/core';
import type { AppEnv } from '../../app';
import { CreatePostSchema, PostIdParam } from './posts.schema';

export const postsRoutes = new Hono<AppEnv>()
  .get('/:id', ...validate({ param: PostIdParam }), async (c) => {
    const { id } = c.req.valid('param');
    const service = c.var.resolve('postService');
    const post = await service.getById(id);
    return c.json({ post });
  })
  .post('/', ...validate({ body: CreatePostSchema }), async (c) => {
    const input = c.req.valid('json');
    const service = c.var.resolve('postService');
    const post = await service.create(input);
    return c.json({ post }, 201);
  });
