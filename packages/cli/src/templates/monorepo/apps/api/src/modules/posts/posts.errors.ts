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
