import { queue } from './app';

// Worker default export. This Worker is queue-only — no `fetch` handler.
// Cloudflare invokes `queue` for each message batch delivered to a queue
// listed in this Worker's `queues.consumers` block in wrangler.jsonc.
export default { queue };
