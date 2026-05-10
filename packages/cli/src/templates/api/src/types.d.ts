/**
 * Module augmentations for `@katajs/core`. Picked up automatically by
 * tsconfig's `include` glob — no runtime import needed. Co-locate everything
 * that teaches the framework about this app's concrete types here.
 *
 * The `katajs:registry-imports` and `katajs:registry` markers below are used
 * by `katajs add module` to insert new module registry entries automatically.
 * If you remove or relocate them, future `add module` runs will print the
 * snippet for you to paste manually.
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

  // Typed producer queues. Each entry maps a queue name to its body type so
  // c.var.queues.<name>.send(body) is fully typed.
  interface QueuesRegistry {
    // katajs:queues-registry
  }
}
