import { eventsModule } from '../src/modules/events/index';
import { auditModule, AuditEventSchema } from '../src/modules/audit/index';
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

/**
 * Producer manifest mirroring the `queues:` block in src/app.ts. Devtools
 * imports this so the graph can render producer/consumer pairs without
 * loading the full app config.
 */
export const producers = {
  auditEvents: { binding: 'AUDIT_QUEUE', schema: AuditEventSchema },
  // katajs:graph-producers
};
