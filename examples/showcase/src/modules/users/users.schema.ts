import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UserIdParam = z.object({
  id: z.string().uuid(),
});
export type UserIdParamInput = z.infer<typeof UserIdParam>;

export const ListUsersQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListUsersQueryInput = z.infer<typeof ListUsersQuery>;
