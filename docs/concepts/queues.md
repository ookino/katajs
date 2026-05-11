# Queues

katajs integrates Cloudflare Queues by extending the module shape: a module can declare an optional `consumer:` field describing what queue it consumes, what schema validates incoming bodies, and what to do with each message. `createApp` returns the queue handler alongside the Hono app, and the Worker exports both halves from one default export.

## The shape at a glance

```ts
// src/modules/orders/index.ts
import { defineModule } from "@katajs/core";
import { z } from "zod";
import { ordersRoutes } from "./orders.routes";
import { makeOrderService, type OrderService } from "./orders.service";

const OrderEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("order.placed"), orderId: z.uuid() }),
  z.object({ type: z.literal("order.refunded"), orderId: z.uuid() }),
]);

export const ordersModule = defineModule({
  name: "orders",
  provides: {
    orderService: (c): OrderService => makeOrderService(c),
  },
  requires: [] as const,

  // HTTP side
  routes: ordersRoutes,
  prefix: "/orders",

  // Queue side
  consumer: {
    queue: "ORDER_QUEUE", // wrangler binding name
    dlq: "ORDER_DLQ", // optional dead-letter binding
    maxRetries: 5, // default 3
    schema: OrderEventSchema,
    async handle(message, c) {
      const service = c.resolve("orderService");
      switch (message.body.type) {
        case "order.placed":
          return service.fulfill(message.body.orderId);
        case "order.refunded":
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

| Concern                        | Where it lives                                                   |
| ------------------------------ | ---------------------------------------------------------------- |
| **Schema**                     | The owning consumer module (`orders/orders.schema.ts` or inline) |
| **Consumer (handle messages)** | The owning module's `consumer:` field                            |
| **Producers (send messages)**  | Anywhere — any module's service, any route, even `app.onError`   |
| **Cross-module type sharing**  | Standard TypeScript imports                                      |

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
     "body": {
       /* the original message body */
     },
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
  name: "order-dlq",
  provides: {},
  requires: [] as const,
  consumer: {
    queue: "ORDER_DLQ",
    schema: DlqEnvelopeSchema, // matches the shape above
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
      { "binding": "ORDER_DLQ", "queue": "orders-dlq" }
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
- **Cloudflare's `dead_letter_queue`** is a platform-level DLQ. Cloudflare routes messages there _automatically_ after `max_retries`. The framework's `consumer.dlq` is a different layer — it lets the _application_ decide when to give up earlier (e.g., on validation failure, before exhausting platform retries). Often you want both: platform-level DLQ for transient failures, framework-level DLQ for known-bad messages.

For the simple case, set `max_retries` in wrangler and `maxRetries` in `consumer:` to the same value, and use one queue as DLQ for both.

## Container lifecycle

Per-message: each message gets its own container.

- `c.requestId` is the message's `id` — propagate through logs for correlation.
- `c.env` is the Cloudflare env (same as HTTP).
- `c.db` is a fresh DB client (fresh `pg.Pool` per message, since Workers don't persist state across invocations).
- `c.resolve(key)` works the same as in HTTP.
- `c.withTransaction(fn)` works — wrap multi-write message handlers in a transaction.

Batch: one container for the whole batch. Same shape; `c.requestId` is a UUID.

What's _not_ available: `c.c` (the Hono Context). Queue handlers don't have an HTTP request, so accessing `c.c.req` (or any other Hono Context property) throws a clear error. Services that need HTTP-specific context shouldn't be invoked from queue handlers.

## Errors and observability

Throw an `AppError` from a handler — it gets caught by the framework's queue dispatcher (separately from Hono's `errorMapper`) and surfaces through `queueErrorMapper.onUnhandled`:

```ts
const { app, queue } = createApp({
  // ...
  queueErrorMapper: {
    onUnhandled: (err, ctx) => {
      console.error("[queue]", ctx.queue, ctx.messageId, err);
      Sentry.captureException(err, {
        tags: {
          queue: ctx.queue,
          messageId: ctx.messageId,
          attempts: ctx.attempts,
        },
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
import { makeTestContainer } from "@katajs/core/testing";

it("fulfills an order on order.placed", async () => {
  const fulfill = vi.fn();
  const c = makeTestContainer({
    services: { orderService: { fulfill, refund: vi.fn() } },
  });

  await ordersModule.consumer!.handle!(
    {
      id: "m1",
      timestamp: new Date(),
      body: { type: "order.placed", orderId: "o1" },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    },
    c,
  );

  expect(fulfill).toHaveBeenCalledWith("o1");
});
```

### Integration tests via `queue!` directly

Drive the dispatcher with a fake batch of fake messages:

```ts
const { queue } = createApp({
  /* ... */
});
const msg = {
  /* ...fake message... */
};
const batch = {
  queue: "ORDER_QUEUE",
  messages: [msg],
  ackAll: vi.fn(),
  retryAll: vi.fn(),
};

await queue!(batch as MessageBatch, fakeEnv, {});

expect(msg.ack).toHaveBeenCalled();
```

This is what the framework's own queue tests do — it's the cleanest way to exercise validation, dispatch, and DLQ logic together.

## Typed producer wrapper: `c.var.queues`

Producing a message via the raw binding works:

```ts
await c.env.ORDER_QUEUE.send({ type: "order.placed", orderId: post.id });
```

But it has three problems: type safety depends on `Queue<T>` being correctly declared in your `Bindings`, validation only happens at the consumer (slow feedback), and there's no central place for cross-cutting concerns like tracing or retries.

The framework provides a typed wrapper. Declare a producer manifest in `createApp({ queues })`:

```ts
import { OrderEventSchema } from './modules/orders/orders.consumer';

const { app, queue } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [...],
  queues: {
    orders: {
      binding: 'ORDER_QUEUE',
      schema: OrderEventSchema,
    },
  },
  routes: ...,
});
```

Then send from any service or route:

```ts
await c.var.queues.orders.send({ type: "order.placed", orderId: post.id });
//                              ↑ typed against z.infer<typeof OrderEventSchema>
//                              ↑ validated synchronously before the network call
```

If you send a malformed body, you get a `ValidationError` _at the call site_ instead of waiting for the consumer to reject it 30 seconds later:

```ts
try {
  await c.var.queues.orders.send({ type: "wrong" });
} catch (err) {
  if (err instanceof ValidationError) {
    // handle the producer-side validation failure
  }
}
```

To make it appear at the type level, augment `QueuesRegistry` in `types.d.ts`:

```ts
declare module "@katajs/core" {
  interface QueuesRegistry {
    orders: TypedQueue<OrderEvent>;
  }
}
```

`katajs add queue <name> --in <module>` does both wirings (the queues entry on `createApp` and the `QueuesRegistry` augmentation) automatically.

### Producer and consumer are independent

The producer manifest on `createApp` is **completely independent of consumer modules.** A module can have a `consumer:` field, the app can have a `queues:` entry for that same queue, both, or neither — whichever halves this Worker is responsible for:

| Worker                                    | Producer manifest? | Consumer module? |
| ----------------------------------------- | ------------------ | ---------------- |
| Single-Worker (api produces + consumes)   | Yes                | Yes              |
| `apps/api` in monorepo (produces only)    | Yes                | No               |
| `apps/worker` in monorepo (consumes only) | No                 | Yes              |

The schema is shared between halves by **TypeScript import** — not by framework wiring. In single-Worker, both halves import from `modules/orders/orders.consumer.ts`. In monorepo, the schema lives in `packages/events/` (or is duplicated, or one app imports from the other).

### Consumer-only mode for apps/worker

When scaffolding a queue consumer in a queue-only Worker (where there's no `createApp({ queues })` block to add to, or the user genuinely doesn't want the producer wired), pass `--no-producer`:

```bash
katajs add queue orders --in orders-consumer --no-producer
```

The CLI generates the consumer file and wires it into the module, but skips the `createApp.queues` entry and the `QueuesRegistry` augmentation.

### Batch sends

`sendBatch` is also typed and validated:

```ts
await c.var.queues.events.sendBatch([
  { type: "page.view", userId: "u1", path: "/" },
  { type: "page.view", userId: "u2", path: "/about" },
]);
```

The framework calls Cloudflare's `Queue.sendBatch` if the binding exposes it; otherwise falls back to per-message `send`. Validation runs against every body before any network call — first failure aborts the batch.

## What's not in v0.2

- **Monorepo `apps/worker/` with shared modules.** `apps/worker` exists today (sibling Worker), but it has its own modules. If multiple apps need to share a module, extract to `packages/modules/` manually for now.
- **Producer-side retry-with-backoff.** The wrapper delegates straight to the binding's `send`. Cloudflare handles retries on the consumer side; producer retries are user code.
- **Outbox pattern helpers** for transactional sends.

## Summary

- A module can declare `consumer: { queue, schema, dlq?, maxRetries?, handle | handleBatch }` — the consumer side.
- `createApp({ queues: { name: { binding, schema } } })` declares the producer side. Surfaces as `c.var.queues.<name>.send(body)` and `sendBatch(bodies)`.
- Producer and consumer are independent — declare either half, both, or neither.
- Producer-side validation happens synchronously before send; throws `ValidationError` on bad bodies.
- Schemas are shared by TypeScript import, not framework wiring.
- `katajs add queue` wires both halves automatically in single-Worker apps; pass `--no-producer` for consumer-only.
