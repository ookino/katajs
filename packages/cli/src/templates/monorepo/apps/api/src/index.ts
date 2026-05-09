import app, { queue } from './app';

// Worker default export. `queue` is undefined when no module declares a
// `consumer:` field; Cloudflare Workers handles either case fine.
export default { fetch: app.fetch, queue };

export type { AppType, AppEnv, Bindings } from './app';
