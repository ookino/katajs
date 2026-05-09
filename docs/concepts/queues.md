# Queues

katajs integrates Cloudflare Queues by extending the module shape: a module can declare an optional `consumer:` field describing what queue it consumes, what schema validates incoming bodies, and what to do with each message. `createApp` returns the queue handler alongside the Hono app, and the Worker exports both halves from one default export.

## The shape at a glance

```ts
// src/modules/orders/index.ts
import { defineModule } from '@katajs/core';
import { z } from 'zod';
import { ordersRoutes } from './orders.routes';
import { makeOrderService, type OrderService } from './orders.service';

const OrderEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('order.placed'), orderId: z.string().uuid() }),
  z.object({ type: z.literal('order.refunded'), orderId: z.string().uuid() }),
]);

export const ordersModule = defineModule({
  name: 'orders',
  provides: {
    orderService: (c): OrderService => makeOrderService(c),
  },
  requires: [] as const,

  // HTTP side
  routes: ordersRoutes,
  prefix: '/orders',

  // Queue side
  consumer: {
    queue: 'ORDER_QUEUE',           // wrangler binding name
    dlq: 'ORDER_DLQ',                // optional dead-letter binding
    maxRetries: 5,                   // default 3
    schema: OrderEventSchema,
    async handle(message, c) {
      const service = c.resolve('orderService');
      switch (message.body.type) {
        case 'order.placed':
          return service.fulfill(message.body.orderId);
        case 'order.refunded':
          return service.refund(message.body.orderId);
      }
    },
  },
});
```

```ts
// src/index.ts
const { app, queue } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [ordersModule, /* ... */],
  routes: (base) => /* ... */,
});

export default {
  fetch: app.fetch,
  queue,
};
```

`queue` is `undefined` when no module declares a consumer — omit it from the default export in that case.

## Producers vs consumers

Producers and consumers are decoupled by design.

| Concern | Where it lives |
|---|---|
| **Schema** | The owning consumer module (`orders/orders.schema.ts` or inline) |
| **Consumer (handle messages)** | The owning module's `consumer:` field |
| **Producers (send messages)** | Anywhere — any module's service, any route, even `app.onError` |
| **Cross-module type sharing** | Standard TypeScript imports |

Any code with access to the queue binding can produce:

```ts
// from a route
.post('/orders', async (c) => {
  const order = await c.var.resolve('orderService').create(input);
  await c.env.ORDER_QUEUE.send({ type: 'order.placed', orderId: order.id });
  return c.json({ order }, 201);
})

// from a service
async function create(input: CreateOrderInput, c: RequestContainer) {
  const order = await c.resolve('orderRepository').insert(input);
  await c.env.ORDER_QUEUE.send({ type: 'order.placed', orderId: order.id });
  return order;
}
```

For type safety, declare the binding shape in your `Bindings` type so `c.env.ORDER_QUEUE.send(...)` typechecks against the schema:

```ts
type Bindings = {
  HYPERDRIVE: Hyperdrive;
  ORDER_QUEUE: Queue<z.infer<typeof OrderEventSchema>>;
};
```

## The notifications-queue pattern

A queue that many modules produce to and one module consumes is the canonical "shared queue" shape. It works without any framework-level "shared queue" concept — producers and consumers are independent:

```
posts module      ──┐
comments module   ──┼──> NOTIFICATIONS_QUEUE ──> notifications module (consumer)
users module      ──┘                              ↓
                                              email / push / SMS
```

The `notifications` module owns:
- The schema (a discriminated union of every notification event type)
- The consumer that dispatches by `type` and sends emails/pushes
- Services that do the actual sending

Producing modules import the relevant variant from `notifications/schema.ts` and call `c.env.NOTIFICATIONS_QUEUE.send(event)`. No special wiring.

## Per-message handler vs batch handler

You pick one of two handler shapes:

### Per-message: `handle(message, c)` — simpler default

```ts
consumer: {
  queue: 'ORDER_QUEUE',
  schema: OrderEventSchema,
  async handle(message, c) {
    // Process one message; framework auto-acks on return, auto-retries on throw.
  },
}
```

The framework iterates the batch, builds a fresh container per message (so each gets its own DB client, request ID, service cache), and dispatches. Returns successfully → acks the message. Throws → retries the message (or routes to DLQ if `attempts >= maxRetries`).

Pick per-message for the common case — when each message is independent and you want the same auto-ack semantics as Cloudflare's docs describe.

### Batch: `handleBatch(batch, c)` — full control

```ts
consumer: {
  queue: 'EVENTS_QUEUE',
  schema: AnalyticsEventSchema,
  async handleBatch(batch, c) {
    // batch.messages is the array; you ack/retry per message
    const buffer = batch.messages.map((m) => m.body);
    try {
      await c.resolve('analyticsService').writeBulk(buffer);
      batch.ackAll();
    } catch (err) {
      batch.retryAll();
    }
  },
}
```

The batch handler receives a single container for the whole batch. You're responsible for acking and retrying — call `msg.ack()`/`msg.retry()` per message, or `batch.ackAll()`/`batch.retryAll()` for everything.

Pick batch when you have **bulk-semantic operations**:

- A single SQL insert that takes 100 rows at once (vs 100 individual inserts).
- A bulk API call to a downstream service (e.g., Stripe's batch endpoints).
- Aggregations or windowed analytics where ordering across the batch matters.

The framework still validates each message body against `schema` before handing the batch to you. Validation failures are dropped from the batch and routed to DLQ (or acked) according to `maxRetries`/`dlq` config — you only see valid messages.

## DLQ (dead-letter queue) handling

Configure a DLQ binding on the consumer:

```ts
consumer: {
  queue: 'ORDER_QUEUE',
  dlq: 'ORDER_DLQ',
  maxRetries: 5,
  schema: OrderEventSchema,
  async handle(message, c) { /* ... */ },
}
```

When a message's `attempts` reaches `maxRetries` (default `3`), the framework:

1. Sends a wrapped message to the DLQ binding with this shape:
   ```json
   {
     "originalQueue": "ORDER_QUEUE",
     "messageId": "...",
     "body": { /* the original message body */ },
     "error": "the error message",
     "attempts": 5,
     "failedAt": "2026-01-15T12:34:56.789Z"
   }
   ```
2. Acks the original message so it doesn't loop.

If `dlq` isn't set, the framework just acks after `maxRetries` — the message is effectively dropped. Always set a DLQ in production unless you genuinely want lossy semantics.

The DLQ is itself a queue. You can have a separate consumer module that consumes from `ORDER_DLQ` and (e.g.) writes to a database for inspection, sends alerts, or replays after a fix:

```ts
const orderDlqModule = defineModule({
  name: 'order-dlq',
  provides: {},
  requires: [] as const,
  consumer: {
    queue: 'ORDER_DLQ',
    schema: DlqEnvelopeSchema,  // matches the shape above
    async handle(msg, c) {
      // log to monitoring, store for later replay, page on-call, etc.
    },
  },
});
```

## wrangler.jsonc configuration

A queue needs both a producer binding (to send) and a consumer binding (to receive). Both go in `wrangler.jsonc`:

```jsonc
{
  "queues": {
    "producers": [
      { "binding": "ORDER_QUEUE", "queue": "orders" },
      { "binding": "ORDER_DLQ",   "queue": "orders-dlq" }
    ],
    "consumers": [
      {
        "queue": "orders",
        "max_batch_size": 100,
        "max_batch_timeout": 30,
        "max_retries": 3,
        "dead_letter_queue": "orders-dlq"
      }
    ]
  }
}
```

Two important things:

- **Cloudflare's `max_retries`** at the consumer level is the platform's retry limit. After exhausting retries, Cloudflare will call your handler with messages that have `attempts: max_retries + 1`. Your `consumer.maxRetries` in code is the framework's own retry/DLQ threshold — it can be the same as wrangler's, lower (DLQ before Cloudflare gives up), or higher (rare; you'd need to ack-and-replay manually).
- **Cloudflare's `dead_letter_queue`** is a platform-level DLQ. Cloudflare routes messages there *automatically* after `max_retries`. The framework's `consumer.dlq` is a different layer — it lets the *application* decide when to give up earlier (e.g., on validation failure, before exhausting platform retries). Often you want both: platform-level DLQ for transient failures, framework-level DLQ for known-bad messages.

For the simple case, set `max_retries` in wrangler and `maxRetries` in `consumer:` to the same value, and use one queue as DLQ for both.

## Container lifecycle

Per-message: each message gets its own container.
- `c.requestId` is the message's `id` — propagate through logs for correlation.
- `c.env` is the Cloudflare env (same as HTTP).
- `c.db` is a fresh DB client (fresh `pg.Pool` per message, since Workers don't persist state across invocations).
- `c.resolve(key)` works the same as in HTTP.
- `c.withTransaction(fn)` works — wrap multi-write message handlers in a transaction.

Batch: one container for the whole batch. Same shape; `c.requestId` is a UUID.

What's *not* available: `c.c` (the Hono Context). Queue handlers don't have an HTTP request, so accessing `c.c.req` (or any other Hono Context property) throws a clear error. Services that need HTTP-specific context shouldn't be invoked from queue handlers.

## Errors and observability

Throw an `AppError` from a handler — it gets caught by the framework's queue dispatcher (separately from Hono's `errorMapper`) and surfaces through `queueErrorMapper.onUnhandled`:

```ts
const { app, queue } = createApp({
  // ...
  queueErrorMapper: {
    onUnhandled: (err, ctx) => {
      console.error('[queue]', ctx.queue, ctx.messageId, err);
      Sentry.captureException(err, {
        tags: { queue: ctx.queue, messageId: ctx.messageId, attempts: ctx.attempts },
      });
    },
  },
});
```

The hook fires for every handler throw — including before the message hits its retry limit and before DLQ routing. So you log ALL failures, even ones the framework will silently retry.

## Testing queue handlers

Two layers:

### Unit tests with `makeTestContainer`

The handler is a function that takes a message and a container. Test it like any service method:

```ts
import { makeTestContainer } from '@katajs/core/testing';

it('fulfills an order on order.placed', async () => {
  const fulfill = vi.fn();
  const c = makeTestContainer({
    services: { orderService: { fulfill, refund: vi.fn() } },
  });

  await ordersModule.consumer!.handle!(
    { id: 'm1', timestamp: new Date(), body: { type: 'order.placed', orderId: 'o1' }, attempts: 1, ack: vi.fn(), retry: vi.fn() },
    c,
  );

  expect(fulfill).toHaveBeenCalledWith('o1');
});
```

### Integration tests via `queue!` directly

Drive the dispatcher with a fake batch of fake messages:

```ts
const { queue } = createApp({ /* ... */ });
const msg = { /* ...fake message... */ };
const batch = { queue: 'ORDER_QUEUE', messages: [msg], ackAll: vi.fn(), retryAll: vi.fn() };

await queue!(batch as MessageBatch, fakeEnv, {});

expect(msg.ack).toHaveBeenCalled();
```

This is what the framework's own queue tests do — it's the cleanest way to exercise validation, dispatch, and DLQ logic together.

## What's not in v0.2

Some things on the roadmap but not in this release:

- **Typed producer wrapper.** Today you call `c.env.ORDER_QUEUE.send(...)`; v0.3's `@katajs/queues` package will add `c.var.resolve('queues').orders.send(...)` as a typed convenience layer. Both will coexist.
- **Monorepo `apps/worker/` companion.** When you graduate to `--monorepo`, a follow-up version will support a sibling Worker that imports modules from `packages/modules/` and runs queue-only (no HTTP). Today, `--monorepo` ships only the API; queue consumers live alongside it as a single Worker.
- **`katajs add queue <name>`.** A CLI command to scaffold a consumer module + wrangler bindings + Worker entry update. Coming alongside the typed producer wrapper.

The runtime shape is stable — when these land they're additions, not breaking changes.

## Summary

- A module can declare `consumer: { queue, schema, dlq?, maxRetries?, handle | handleBatch }`.
- `createApp` returns `{ app, queue, modules }`. `queue` is `undefined` if no module has a consumer.
- Per-message handler auto-acks on success, auto-retries on throw, DLQs after `maxRetries`.
- Batch handler gives full per-message control for bulk operations.
- Producers are free — any code with the binding can `send()`. No framework wiring needed.
- Schemas live in the consumer module; producers import the variant they need.
