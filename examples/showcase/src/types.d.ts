/**
 * Module augmentations for `@katajs/core`. Picked up automatically by
 * tsconfig's `include` glob — no runtime import needed.
 */
import type { DrizzleClient } from '@katajs/drizzle';
import type * as schema from './db/schema';
import type { Bindings } from './app';

import type { PostsRegistry } from './modules/posts/index';
import type { EventsRegistry } from './modules/events/index';
import type { AuditRegistry } from './modules/audit/index';
import type { UsersRegistry } from './modules/users/index';
import type { CommentsRegistry } from './modules/comments/index';
// katajs:registry-imports

declare module '@katajs/core' {
  interface AppDb extends DrizzleClient<typeof schema> {}
  interface AppEnv extends Bindings {}
  interface Registry
    extends PostsRegistry
    , EventsRegistry
    , AuditRegistry
    , UsersRegistry
    , CommentsRegistry
    // katajs:registry
  {}
}
