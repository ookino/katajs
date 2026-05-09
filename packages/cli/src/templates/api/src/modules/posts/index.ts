import { defineModule } from '@katajs/core';
import { makePostRepository, type PostRepository } from './posts.repository';
import { makePostService, type PostsService } from './posts.service';
// katajs:module-service-imports
import { postsRoutes } from './posts.routes';

export const postsModule = defineModule({
  name: 'posts',
  provides: {
    postRepository: (c): PostRepository => makePostRepository(c.db),
    postService: (c): PostsService => makePostService(c),
    // katajs:module-provides
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
  // katajs:module-registry
};

export type { PostRepository, PostsService };
