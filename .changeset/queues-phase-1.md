---
'@katajs/core': minor
'@katajs/drizzle': minor
'@katajs/cli': minor
'create-katajs': minor
---

**Cloudflare Queues integration (Phase 1)** — modules can declare a `consumer:` field; `createApp` returns the queue handler alongside the Hono app.

```ts
const { app, queue } = createApp({ ... });
export default { fetch: app.fetch, queue };
```

In `@katajs/core`:

- New `ConsumerSpec` type, discriminated on `handle` (per-message) vs `handleBatch` (batch). Mutually exclusive at the type level. Optional `dlq` (binding name) and `maxRetries` (default 3).
- `defineModule` extended to accept `consumer:` on both routed and services-only modules. A module can own routes, a consumer, both, or neither.
- New per-message container construction shared with HTTP via `buildContainer` in `container.ts`. Queue containers use the message ID as `requestId`. The Hono Context is replaced with a stub that throws on access (queue handlers don't have an HTTP context — clear failure if a service tries to read `c.req`).
- `buildQueueHandler` walks modules with `consumer:`, dispatches by binding name, validates with the schema, auto-acks on success, auto-retries on throw. After `maxRetries` attempts, sends a wrapped envelope to the DLQ binding (if configured) and acks the original — or just acks (drops) if no DLQ. Validation failures route through the same DLQ machinery.
- New `queueErrorMapper` config on `createApp` for queue-side `onUnhandled` (separate from HTTP `errorMapper`).
- New exports: `QueueHandler`, `QueueErrorMapperOptions`, `ValidatedMessage`, `ValidatedBatch`, `ConsumerSpec`, `ConsumerHandler`, `ConsumerBatchHandler`, `MessageSchema`.

Scaffolder templates (`create-katajs`):

- API + monorepo `apps/api` templates: Worker default export switched to `{ fetch: app.fetch, queue }` (queue is undefined when no module has a consumer; CF Workers handles that fine — forward-compatible with adding consumers later).
- `wrangler.jsonc` ships with commented-out queue producer/consumer/DLQ binding examples.

Tests: 16 new queue dispatch tests in `@katajs/core` (success ack, throw retry, DLQ routing, validation failure handling, batch handler, multi-queue dispatch, container scoping, duplicate-consumer detection). Workspace total: 139 passing.

Out of scope for Phase 1 (deferred):

- `@katajs/queues` package with typed producer wrappers (`c.var.resolve('queues').orders.send(...)`).
- `katajs add queue <name>` CLI command.
- Monorepo `apps/worker/` companion (requires modules in `packages/`).
