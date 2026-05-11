import { z } from 'zod';

export const CreateCommentSchema = z.object({
  postId: z.uuid(),
  authorId: z.string().min(1),
  body: z.string().min(1).max(2_000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const CommentIdParam = z.object({
  id: z.uuid(),
});
export type CommentIdParamInput = z.infer<typeof CommentIdParam>;

export const ListCommentsQuery = z.object({
  postId: z.uuid(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});
export type ListCommentsQueryInput = z.infer<typeof ListCommentsQuery>;

export const DeleteCommentQuery = z.object({
  actorId: z.string().min(1),
});
export type DeleteCommentQueryInput = z.infer<typeof DeleteCommentQuery>;
