import { createApp } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from '@{{PROJECT_NAME}}/db';

import { exampleConsumerModule } from './modules/example-consumer/index';
// katajs:module-imports

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
};

const { queue } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [
    exampleConsumerModule,
    // katajs:modules
  ],
  queueErrorMapper: {
    onUnhandled: (_err, _ctx) => {
      // Real apps ship to Sentry/Logflare/etc. here.
    },
  },
  // No routes — this Worker has no HTTP surface.
});

export { queue };
