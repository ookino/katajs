import { AppError } from '@katajs/core';

export class PostNotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = 'post_not_found';
  override readonly publicMessage = 'Post not found';

  constructor(public readonly postId: string) {
    super(`Post ${postId} not found`);
  }

  override get publicPayload() {
    return { postId: this.postId };
  }
}

export class ForbiddenPostError extends AppError {
  override readonly status = 403;
  override readonly code = 'forbidden';
  override readonly publicMessage = 'You may not modify this post';

  constructor(public readonly postId: string, public readonly actorId: string) {
    super(`Actor ${actorId} cannot modify post ${postId}`);
  }
}
