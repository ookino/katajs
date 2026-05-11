import { z } from 'zod';

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  authorId: z.string().min(1),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

export const PostIdParam = z.object({
  id: z.uuid(),
});
export type PostIdParamInput = z.infer<typeof PostIdParam>;

export const ListPostsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListPostsQueryInput = z.infer<typeof ListPostsQuery>;
