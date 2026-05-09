/**
 * Module augmentations for `@katajs/core`. Picked up automatically by
 * tsconfig's `include` glob — no runtime import needed.
 */
import type { DrizzleClient } from '@katajs/drizzle';
import type * as schema from '@{{PROJECT_NAME}}/db';
import type { Bindings } from './app';

import type { ExampleConsumerRegistry } from './modules/example-consumer/index';
// katajs:registry-imports

declare module '@katajs/core' {
  interface AppDb extends DrizzleClient<typeof schema> {}
  interface AppEnv extends Bindings {}
  interface Registry
    extends ExampleConsumerRegistry
    // katajs:registry
  {}
}
