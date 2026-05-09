import { defineModule } from "@katajs/core";
import { makePostRepository, type PostRepository } from "./posts.repository";
import { makePostService, type PostsService } from "./posts.service";
import { postsRoutes } from "./posts.routes";

export const postsModule = defineModule({
  name: "posts",
  provides: {
    postRepository: (c): PostRepository => makePostRepository(c.db),
    postService: (c): PostsService => makePostService(c),
  },
  // Cross-module: posts.create() fans out into auditService (which itself fans
  // into eventService). The dependency graph is posts → audit → events.
  requires: ["auditService"] as const,
  routes: postsRoutes,
  prefix: "/posts",
});

/** Services this module contributes to the container's `Registry`. */
export type PostsRegistry = {
  postRepository: PostRepository;
  postService: PostsService;
};

export type { PostRepository, PostsService };
export { PostNotFoundError, ForbiddenPostError } from "./posts.errors";
