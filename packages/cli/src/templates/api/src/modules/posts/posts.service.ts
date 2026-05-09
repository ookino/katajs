import type { RequestContainer } from '@katajs/core';
import { PostNotFoundError } from './posts.errors';
import type { CreatePostInput } from './posts.schema';
import type { Post } from '../../db/schema';

export type PostsService = {
  getById(id: string): Promise<Post>;
  create(input: CreatePostInput): Promise<Post>;
};

export function makePostService(c: RequestContainer): PostsService {
  return {
    async getById(id) {
      const repo = c.resolve('postRepository');
      const post = await repo.findById(id);
      if (!post) throw new PostNotFoundError(id);
      return post;
    },
    async create(input) {
      return c.withTransaction(async (tx) => {
        const repo = tx.resolve('postRepository');
        return repo.insert(input);
      });
    },
  };
}
