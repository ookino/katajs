/**
 * Module augmentations for `@katajs/core`. Picked up automatically by
 * tsconfig's `include` glob — no runtime import needed. Co-locate everything
 * that teaches the framework about this app's concrete types here.
 *
 * As you add modules:
 *   1. import their `XxxRegistry` type below.
 *   2. add `, XxxRegistry` to the `Registry extends ...` clause.
 */
import type { DrizzleClient } from '@katajs/drizzle';
import type * as schema from './db/schema';
import type { PostsRegistry } from './modules/posts/index';
import type { Bindings } from './app';

declare module '@katajs/core' {
  interface AppDb extends DrizzleClient<typeof schema> {}
  interface AppEnv extends Bindings {}
  interface Registry extends PostsRegistry {}
}
