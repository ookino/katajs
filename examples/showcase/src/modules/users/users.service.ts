import type { RequestContainer } from '@katajs/core';
import type { User } from '../../db/schema';
import type { CreateUserInput, ListUsersQueryInput } from './users.schema';
import { EmailTakenError, UserNotFoundError } from './users.errors';

export type UserService = {
  getById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | undefined>;
  list(opts: ListUsersQueryInput): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
};

export function makeUserService(c: RequestContainer): UserService {
  return {
    async getById(id) {
      const repo = c.resolve('userRepository');
      const user = await repo.findById(id);
      if (!user) throw new UserNotFoundError(id);
      return user;
    },

    async findByEmail(email) {
      const repo = c.resolve('userRepository');
      return repo.findByEmail(email);
    },

    async list(opts) {
      const repo = c.resolve('userRepository');
      return repo.list({
        offset: (opts.page - 1) * opts.pageSize,
        limit: opts.pageSize,
      });
    },

    async create(input) {
      const repo = c.resolve('userRepository');
      const existing = await repo.findByEmail(input.email);
      if (existing) throw new EmailTakenError(input.email);
      return repo.insert(input);
    },
  };
}
