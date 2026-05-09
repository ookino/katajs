import { createApp, type RequestVariables } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from './db/schema';

import { postsModule } from './modules/posts/index';
import { eventsModule } from './modules/events/index';
import { auditModule } from './modules/audit/index';
import { usersModule } from './modules/users/index';
import { commentsModule } from './modules/comments/index';
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
  // Module order doesn't affect runtime — boot validation handles deps.
  // Listed here in dependency-graph order for readability:
  //   events ← audit ← posts
  //                  ← comments
  //   users (independent)
  modules: [
    eventsModule,
    auditModule,
    usersModule,
    postsModule,
    commentsModule,
    // katajs:modules
  ],
  middleware: [
    async (_c, next) => {
      // Demo middleware slot — real apps put auth, request logging, etc. here.
      await next();
    },
  ],
  errorMapper: {
    onUnhandled: (_err, _ctx) => {
      // Real apps ship to Sentry/Logflare/etc. here.
    },
  },
  routes: (base) =>
    base
      .get('/health', (c) =>
        c.json({ ok: true, requestId: c.var.requestId }),
      )
      .route(usersModule.prefix, usersModule.routes)
      .route(postsModule.prefix, postsModule.routes)
      .route(commentsModule.prefix, commentsModule.routes),
  // katajs:routes
});

export { queue };
export default app;
export type AppType = typeof app;
