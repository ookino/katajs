import { eventsModule } from '../src/modules/events/index';
import { auditModule } from '../src/modules/audit/index';
import { usersModule } from '../src/modules/users/index';
import { postsModule } from '../src/modules/posts/index';
import { commentsModule } from '../src/modules/comments/index';
// katajs:graph-imports

export const modules = [
  eventsModule,
  auditModule,
  usersModule,
  postsModule,
  commentsModule,
  // katajs:graph-modules
];
