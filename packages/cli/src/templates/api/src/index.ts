import app, { queue } from './app';

// Worker default export. `queue` is undefined when no module declares a
// `consumer:` field — Cloudflare Workers handles either case fine. When
// you add your first consumer, no change to this file is needed.
export default { fetch: app.fetch, queue };
