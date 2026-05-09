import { createApp, type RequestVariables } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from './db/schema';
import { postsModule } from './modules/posts/index';

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
  modules: [postsModule],
  routes: (base) => base.route(postsModule.prefix, postsModule.routes),
});

export default app;
export type AppType = typeof app;
