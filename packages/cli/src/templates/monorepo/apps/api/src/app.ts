import { createApp, type RequestVariables } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from '@{{PROJECT_NAME}}/db';

import { postsModule } from './modules/posts/index';
// katajs:module-imports

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: RequestVariables;
};

const { app, queue } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [
    postsModule,
    // katajs:modules
  ],
  // Producer manifest. Each entry surfaces a typed wrapper at
  // c.var.queues.<name>.send(body), validated against the schema.
  queues: {
    // katajs:queues
  },
  // Define your HTTP surface here. Add `.get()` / `.post()` for ad-hoc routes
  // (health checks, webhooks) and `.route(prefix, module.routes)` per module.
  routes: (base) =>
    base
      .get('/health', (c) =>
        c.json({ ok: true, requestId: c.var.requestId }),
      )
      .route(postsModule.prefix, postsModule.routes),
  // katajs:routes
});

export { queue };
export default app;
export type AppType = typeof app;
