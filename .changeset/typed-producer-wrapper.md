---
'@katajs/core': minor
'@katajs/cli': minor
'@katajs/drizzle': minor
'create-katajs': minor
---

**Typed producer wrapper for queues.** `createApp({ queues: { name: { binding, schema } } })` declares producer manifests. Each entry surfaces as `c.var.queues.<name>.send(body)` — validated against the schema before delegating to `c.env[binding].send(...)`.

```ts
const { app, queue } = createApp({
  modules: [...],
  queues: {
    orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
  },
});

// Anywhere with c access:
await c.var.queues.orders.send({ type: 'order.placed', orderId: '...' });
//                              ↑ typed against z.infer<typeof OrderEventSchema>
//                              ↑ throws ValidationError synchronously on bad body
```

**Producer and consumer are explicitly independent.** A module's `consumer:` field declares the consumer side (already shipped). The new `createApp({ queues })` declares the producer side. They share schemas by TypeScript import, not by framework wiring. This means:

- Single-Worker apps declare both halves (consumer on module, producer in createApp); both import the same schema.
- `apps/api` in a monorepo can declare producer-only (consumer lives in `apps/worker`).
- `apps/worker` declares consumer-only (no `queues:` block in createApp).

In `@katajs/core`:

- New `TypedQueue<TBody>` interface with `send(body, options?)` and `sendBatch(bodies, options?)`.
- New augmentable `QueuesRegistry` interface (mirrors `Registry` pattern).
- New `QueueDeclaration<TBody>` type for `createApp.queues` entries.
- New `SendOptions` and `SendBatchOptions` types.
- Container middleware reads the queues config and builds `c.var.queues` per request. Each `send` validates with the schema; throws `ValidationError` (which the existing HTTP `errorMapper` renders as 400 if it bubbles up unhandled).
- `RequestVariables` gains a `queues: QueuesRegistry` field.
- `sendBatch` uses Cloudflare's native `Queue.sendBatch` when available, falls back to per-message `send` otherwise.

In CLI (`katajs add queue`):

- Adds the producer manifest entry to `createApp({ queues })` via a new `// katajs:queues` anchor.
- Adds the `QueuesRegistry` augmentation entry to `types.d.ts` via a new `// katajs:queues-registry` anchor.
- Imports the schema (already exported from the generated consumer file) into both `app.ts` and `types.d.ts`.
- New `--no-producer` flag for consumer-only scaffolding (apps/worker).

Templates updated:

- `templates/api/src/app.ts`, `templates/monorepo/apps/api/src/app.ts`, `examples/basic/src/app.ts`: ship with `queues: { /* katajs:queues */ }` block in createApp.
- `templates/api/src/types.d.ts`, `templates/monorepo/apps/api/src/types.d.ts`, `examples/basic/src/types.d.ts`: ship with `interface QueuesRegistry { /* katajs:queues-registry */ }` augmentation.

Tests: 8 new in `@katajs/core` covering validate-on-send, multi-queue dispatch, sendBatch with and without binding-side support, missing-binding error, ValidationError catchable from user code. Workspace total: 172 passing.

End-to-end verified by scaffolding a project, running `katajs add queue orders --in posts`, installing with workspace overrides, `pnpm typecheck` clean.
