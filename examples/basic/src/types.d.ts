/**
 * Module augmentations for `@katajs/core`. Picked up automatically by
 * tsconfig's `include` glob — no runtime import needed.
 */
import type { DrizzleClient } from '@katajs/drizzle';
import type * as schema from './db/schema';
import type { Bindings } from './app';

import type { PostsRegistry } from './modules/posts/index';
// katajs:registry-imports

declare module '@katajs/core' {
  interface AppDb extends DrizzleClient<typeof schema> {}
  interface AppEnv extends Bindings {}
  interface Registry
    extends PostsRegistry
    // katajs:registry
  {}

  interface QueuesRegistry {
    // katajs:queues-registry
  }
}
