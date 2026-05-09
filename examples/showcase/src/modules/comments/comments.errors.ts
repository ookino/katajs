import { AppError } from '@katajs/core';

export class CommentNotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = 'comment_not_found';
  override readonly publicMessage = 'Comment not found';
  constructor(public readonly commentId: string) {
    super(`Comment ${commentId} not found`);
  }
  override get publicPayload() {
    return { commentId: this.commentId };
  }
}

export class ForbiddenCommentError extends AppError {
  override readonly status = 403;
  override readonly code = 'forbidden';
  override readonly publicMessage = 'You may not modify this comment';
  constructor(public readonly commentId: string, public readonly actorId: string) {
    super(`Actor ${actorId} cannot modify comment ${commentId}`);
  }
}
