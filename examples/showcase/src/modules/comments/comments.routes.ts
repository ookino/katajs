import { Hono } from 'hono';
import { validate } from '@katajs/core';
import type { AppEnv } from '../../app';
import {
  CommentIdParam,
  CreateCommentSchema,
  DeleteCommentQuery,
  ListCommentsQuery,
} from './comments.schema';

export const commentsRoutes = new Hono<AppEnv>()
  .get('/', ...validate({ query: ListCommentsQuery }), async (c) => {
    const query = c.req.valid('query');
    const service = c.var.resolve('commentService');
    const items = await service.listByPost(query);
    return c.json({ comments: items });
  })
  .post('/', ...validate({ body: CreateCommentSchema }), async (c) => {
    const input = c.req.valid('json');
    const service = c.var.resolve('commentService');
    const comment = await service.create(input);
    return c.json({ comment }, 201);
  })
  .delete(
    '/:id',
    ...validate({ param: CommentIdParam, query: DeleteCommentQuery }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { actorId } = c.req.valid('query');
      const service = c.var.resolve('commentService');
      await service.deleteOwned({ id, actorId });
      return c.json({ ok: true });
    },
  )
  // katajs:module-routes
  ;
