import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '@katajs/core';
import type { AppEnv } from '../../app';
import { CreatePostSchema, ListPostsQuery, PostIdParam } from './posts.schema';

const DeletePostQuery = z.object({ actorId: z.string().min(1) });

export const postsRoutes = new Hono<AppEnv>()
  .get('/', ...validate({ query: ListPostsQuery }), async (c) => {
    const query = c.req.valid('query');
    const service = c.var.resolve('postService');
    const items = await service.list(query);
    return c.json({ posts: items });
  })
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
  })
  .delete(
    '/:id',
    // `actorId` provided as query string (no auth in the showcase).
    ...validate({ param: PostIdParam, query: DeletePostQuery }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { actorId } = c.req.valid('query');
      const service = c.var.resolve('postService');
      await service.deleteOwned({ id, actorId });
      return c.json({ ok: true });
    },
  );
