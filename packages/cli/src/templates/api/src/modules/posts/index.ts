import { defineModule } from '@katajs/core';
import { makePostRepository, type PostRepository } from './posts.repository';
import { makePostService, type PostsService } from './posts.service';
import { postsRoutes } from './posts.routes';

export const postsModule = defineModule({
  name: 'posts',
  provides: {
    postRepository: (c): PostRepository => makePostRepository(c.db),
    postService: (c): PostsService => makePostService(c),
  },
  requires: [] as const,
  routes: postsRoutes,
  prefix: '/posts',
});

/**
 * Services this module contributes to the container's `Registry`. Compose it
 * in `app.ts` via `interface Registry extends PostsRegistry {}`. Adding a new
 * module is one extra `extends` clause — no key-by-key bookkeeping.
 */
export type PostsRegistry = {
  postRepository: PostRepository;
  postService: PostsService;
};

export type { PostRepository, PostsService };
