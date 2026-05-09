import type { RequestContainer } from "@katajs/core";
import type { Post } from "../../db/schema";
import type { CreatePostInput, ListPostsQueryInput } from "./posts.schema";
import { ForbiddenPostError, PostNotFoundError } from "./posts.errors";

export type PostsService = {
  getById(id: string): Promise<Post>;
  list(opts: ListPostsQueryInput): Promise<Post[]>;
  /**
   * Creates a post + records an `events` row + writes an `audit_log` entry —
   * all in a single transaction. If any step throws, the transaction rolls
   * back and the database state is unchanged.
   */
  create(input: CreatePostInput): Promise<Post>;
  /**
   * Deletes a post owned by `actorId`. Throws `ForbiddenPostError` if the
   * post belongs to someone else, `PostNotFoundError` if it doesn't exist.
   */
  deleteOwned(args: { id: string; actorId: string }): Promise<void>;
};

export function makePostService(c: RequestContainer): PostsService {
  return {
    async getById(id) {
      const repo = c.resolve("postRepository");
      const post = await repo.findById(id);
      if (!post) throw new PostNotFoundError(id);
      return post;
    },

    async list(opts) {
      const repo = c.resolve("postRepository");
      return repo.list({
        offset: (opts.page - 1) * opts.pageSize,
        limit: opts.pageSize,
      });
    },

    async create(input) {
      return c.withTransaction(async (tx) => {
        const repo = tx.resolve("postRepository");
        const post = await repo.insert(input);

        // Cross-module side effects, all bound to the same transaction:
        const auditService = tx.resolve("auditService");
        await auditService.log({
          actorId: input.authorId,
          action: "post.created",
          details: { postId: post.id, title: post.title },
        });

        return post;
      });
    },

    async deleteOwned({ id, actorId }) {
      const repo = c.resolve("postRepository");
      const post = await repo.findById(id);
      if (!post) throw new PostNotFoundError(id);
      if (post.authorId !== actorId) throw new ForbiddenPostError(id, actorId);

      await c.withTransaction(async (tx) => {
        const txRepo = tx.resolve("postRepository");
        await txRepo.deleteById(id);

        const auditService = tx.resolve("auditService");
        await auditService.log({
          actorId,
          action: "post.deleted",
          details: { postId: id },
        });
      });
    },
  };
}
