import { defineModule } from '@katajs/core';
import {
  makeCommentRepository,
  type CommentRepository,
} from './comments.repository';
import {
  makeCommentService,
  type CommentService,
} from './comments.service';
// katajs:module-service-imports
import { commentsRoutes } from './comments.routes';

export const commentsModule = defineModule({
  name: 'comments',
  provides: {
    commentRepository: (c): CommentRepository => makeCommentRepository(c.db),
    commentService: (c): CommentService => makeCommentService(c),
    // katajs:module-provides
  },
  // Cross-module deps:
  //   - postService: validates the parent post exists before insert
  //   - auditService: writes audit entries (which fans into eventService transitively)
  // The dependency graph is comments → posts → audit → events, plus
  // comments → audit directly.
  requires: ['postService', 'auditService'] as const,
  routes: commentsRoutes,
  prefix: '/comments',
});

/** Services this module contributes to the container's `Registry`. */
export type CommentsRegistry = {
  commentRepository: CommentRepository;
  commentService: CommentService;
  // katajs:module-registry
};

export type { CommentRepository, CommentService };
export { CommentNotFoundError, ForbiddenCommentError } from './comments.errors';
