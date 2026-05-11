import { z } from 'zod';

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

export const PostIdParam = z.object({
  id: z.uuid(),
});
export type PostIdParamInput = z.infer<typeof PostIdParam>;
