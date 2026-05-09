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

const { app } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [
    postsModule,
    // katajs:modules
  ],
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

export default app;
export type AppType = typeof app;
