import type { RequestContainer } from '@katajs/core';
import type { Comment } from '../../db/schema';
import type {
  CreateCommentInput,
  ListCommentsQueryInput,
} from './comments.schema';
import { CommentNotFoundError, ForbiddenCommentError } from './comments.errors';

export type CommentService = {
  /**
   * Creates a comment on a post. Validates the post exists (cross-module call
   * to `postService.getById`, which throws `PostNotFoundError` → 404).
   * Wraps the insert + audit + event side-effects in a single transaction.
   */
  create(input: CreateCommentInput): Promise<Comment>;
  listByPost(opts: ListCommentsQueryInput): Promise<Comment[]>;
  /** Deletes a comment owned by `actorId`. Audited inside a tx. */
  deleteOwned(args: { id: string; actorId: string }): Promise<void>;
};

export function makeCommentService(c: RequestContainer): CommentService {
  return {
    async create(input) {
      // Cross-module validation: postService throws PostNotFoundError if the
      // parent post doesn't exist. The error mapper renders it as 404.
      const postService = c.resolve('postService');
      await postService.getById(input.postId);

      return c.withTransaction(async (tx) => {
        const repo = tx.resolve('commentRepository');
        const comment = await repo.insert(input);

        const audit = tx.resolve('auditService');
        await audit.log({
          actorId: input.authorId,
          action: 'comment.created',
          details: { commentId: comment.id, postId: input.postId },
        });

        return comment;
      });
    },

    async listByPost(opts) {
      const repo = c.resolve('commentRepository');
      return repo.listByPost(opts.postId, {
        offset: (opts.page - 1) * opts.pageSize,
        limit: opts.pageSize,
      });
    },

    async deleteOwned({ id, actorId }) {
      const repo = c.resolve('commentRepository');
      const comment = await repo.findById(id);
      if (!comment) throw new CommentNotFoundError(id);
      if (comment.authorId !== actorId)
        throw new ForbiddenCommentError(id, actorId);

      await c.withTransaction(async (tx) => {
        const txRepo = tx.resolve('commentRepository');
        await txRepo.deleteById(id);
        const audit = tx.resolve('auditService');
        await audit.log({
          actorId,
          action: 'comment.deleted',
          details: { commentId: id, postId: comment.postId },
        });
      });
    },
  };
}
