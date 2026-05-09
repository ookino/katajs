import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp, defineModule } from '../src';

type FakeMessage<Body = unknown> = {
  id: string;
  timestamp: Date;
  body: Body;
  attempts: number;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

type FakeBatch<Body = unknown> = {
  queue: string;
  messages: FakeMessage<Body>[];
  ackAll: ReturnType<typeof vi.fn>;
  retryAll: ReturnType<typeof vi.fn>;
};

function makeMessage<Body>(opts: {
  id?: string;
  body: Body;
  attempts?: number;
}): FakeMessage<Body> {
  return {
    id: opts.id ?? 'msg-' + Math.random().toString(36).slice(2),
    timestamp: new Date(),
    body: opts.body,
    attempts: opts.attempts ?? 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch<Body>(queue: string, messages: FakeMessage<Body>[]): FakeBatch<Body> {
  return {
    queue,
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

const noopDb = {
  create: () => ({}),
};

describe('createApp queue handler', () => {
  it('returns queue=undefined when no module declares a consumer', () => {
    const m = defineModule({
      name: 'plain',
      provides: {},
      requires: [] as const,
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });
    expect(queue).toBeUndefined();
  });

  it('returns a queue handler when at least one module has a consumer', () => {
    const m = defineModule({
      name: 'orders-consumer',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({ orderId: z.string() }),
        async handle() {},
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });
    expect(queue).toBeDefined();
  });

  it('throws on duplicate consumers for the same queue binding', () => {
    const a = defineModule({
      name: 'a',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'SHARED_QUEUE',
        schema: z.object({}),
        async handle() {},
      },
    });
    const b = defineModule({
      name: 'b',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'SHARED_QUEUE',
        schema: z.object({}),
        async handle() {},
      },
    });
    expect(() => createApp({ db: noopDb, modules: [a, b] })).toThrow(/Duplicate queue consumer/);
  });
});

describe('per-message handler', () => {
  it('auto-acks on success', async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({ orderId: z.string() }),
        handle,
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const msg = makeMessage({ body: { orderId: 'o1' } });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);

    await queue!(batch as never, {}, {});

    expect(handle).toHaveBeenCalledOnce();
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('auto-retries on throw (when attempts < maxRetries)', async () => {
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({ orderId: z.string() }),
        async handle() {
          throw new Error('handler boom');
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const msg = makeMessage({ body: { orderId: 'o1' }, attempts: 1 });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);

    await queue!(batch as never, {}, {});

    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('routes to DLQ after maxRetries when configured', async () => {
    const dlqSend = vi.fn().mockResolvedValue(undefined);
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        dlq: 'ORDERS_DLQ',
        maxRetries: 3,
        schema: z.object({ orderId: z.string() }),
        async handle() {
          throw new Error('handler boom');
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const msg = makeMessage({ body: { orderId: 'o1' }, attempts: 3 });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);

    await queue!(batch as never, { ORDERS_DLQ: { send: dlqSend } } as never, {});

    expect(dlqSend).toHaveBeenCalledOnce();
    expect(dlqSend.mock.calls[0]![0]).toMatchObject({
      originalQueue: 'ORDERS_QUEUE',
      messageId: msg.id,
      error: 'handler boom',
      attempts: 3,
    });
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('acks (drops) after maxRetries when no DLQ configured', async () => {
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        maxRetries: 3,
        schema: z.object({ orderId: z.string() }),
        async handle() {
          throw new Error('boom');
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const msg = makeMessage({ body: { orderId: 'o1' }, attempts: 3 });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);

    await queue!(batch as never, {}, {});

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('schema-failed messages also flow through retry/dlq machinery', async () => {
    const dlqSend = vi.fn().mockResolvedValue(undefined);
    const handle = vi.fn();
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        dlq: 'ORDERS_DLQ',
        maxRetries: 2,
        schema: z.object({ orderId: z.string().uuid() }),
        handle,
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const msg = makeMessage({ body: { orderId: 'not-a-uuid' }, attempts: 2 });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);

    await queue!(batch as never, { ORDERS_DLQ: { send: dlqSend } } as never, {});

    expect(handle).not.toHaveBeenCalled();
    expect(dlqSend).toHaveBeenCalledOnce();
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('passes a per-message container with the message id as requestId', async () => {
    let observedRequestId: string | undefined;
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({ orderId: z.string() }),
        async handle(_msg, c) {
          observedRequestId = c.requestId;
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const msg = makeMessage({ id: 'msg-abc-123', body: { orderId: 'o1' } });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);

    await queue!(batch as never, {}, {});

    expect(observedRequestId).toBe('msg-abc-123');
  });

  it('container resolves services from the registry', async () => {
    const m = defineModule({
      name: 'orders',
      provides: {
        orderService: () => ({ greet: () => 'hi' }),
      },
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({}),
        async handle(_msg, c) {
          // Need types.d.ts augmentation to typecheck c.resolve('orderService') here;
          // for the test we can use the loose form via container.c stub avoidance.
          const svc = c.resolve('orderService' as never) as { greet(): string };
          expect(svc.greet()).toBe('hi');
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });
    const msg = makeMessage({ body: {} });
    const batch = makeBatch('ORDERS_QUEUE', [msg]);
    await queue!(batch as never, {}, {});
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('invokes onUnhandled with the queue name + message id on handler throw', async () => {
    const onUnhandled = vi.fn();
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({}),
        async handle() {
          throw new Error('boom');
        },
      },
    });
    const { queue } = createApp({
      db: noopDb,
      modules: [m],
      queueErrorMapper: { onUnhandled },
    });

    const msg = makeMessage({ id: 'msg-77', body: {} });
    await queue!(makeBatch('ORDERS_QUEUE', [msg]) as never, {}, {});

    expect(onUnhandled).toHaveBeenCalledOnce();
    const [err, ctx] = onUnhandled.mock.calls[0]!;
    expect((err as Error).message).toBe('boom');
    expect(ctx).toMatchObject({ queue: 'ORDERS_QUEUE', messageId: 'msg-77' });
  });
});

describe('batch handler', () => {
  it('passes the validated batch to the user handler', async () => {
    let receivedQueue: string | undefined;
    let receivedCount = 0;
    const m = defineModule({
      name: 'analytics',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'EVENTS_QUEUE',
        schema: z.object({ event: z.string() }),
        async handleBatch(batch) {
          receivedQueue = batch.queue;
          receivedCount = batch.messages.length;
          for (const m of batch.messages) m.ack();
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const messages = [
      makeMessage({ body: { event: 'a' } }),
      makeMessage({ body: { event: 'b' } }),
      makeMessage({ body: { event: 'c' } }),
    ];
    const batch = makeBatch('EVENTS_QUEUE', messages);

    await queue!(batch as never, {}, {});

    expect(receivedQueue).toBe('EVENTS_QUEUE');
    expect(receivedCount).toBe(3);
    for (const m of messages) expect(m.ack).toHaveBeenCalled();
  });

  it('retries the whole batch on uncaught throw', async () => {
    const m = defineModule({
      name: 'analytics',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'EVENTS_QUEUE',
        schema: z.object({}),
        async handleBatch() {
          throw new Error('batch boom');
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const batch = makeBatch('EVENTS_QUEUE', [makeMessage({ body: {} })]);

    await queue!(batch as never, {}, {});

    expect(batch.retryAll).toHaveBeenCalledOnce();
  });

  it('drops invalid messages from the batch (DLQ when configured)', async () => {
    const dlqSend = vi.fn().mockResolvedValue(undefined);
    let receivedCount = 0;
    const m = defineModule({
      name: 'analytics',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'EVENTS_QUEUE',
        dlq: 'EVENTS_DLQ',
        maxRetries: 1,
        schema: z.object({ kind: z.literal('valid') }),
        async handleBatch(batch) {
          receivedCount = batch.messages.length;
          batch.ackAll();
        },
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const valid = makeMessage({ body: { kind: 'valid' } });
    const invalid = makeMessage({ body: { kind: 'wrong' }, attempts: 1 });
    const batch = makeBatch('EVENTS_QUEUE', [valid, invalid]);

    await queue!(batch as never, { EVENTS_DLQ: { send: dlqSend } } as never, {});

    expect(receivedCount).toBe(1);
    expect(dlqSend).toHaveBeenCalledOnce();
  });
});

describe('multi-queue dispatch', () => {
  it('routes batches to the right consumer based on batch.queue', async () => {
    const ordersHandle = vi.fn();
    const eventsHandle = vi.fn();

    const orders = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({}),
        handle: ordersHandle,
      },
    });

    const events = defineModule({
      name: 'events',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'EVENTS_QUEUE',
        schema: z.object({}),
        handle: eventsHandle,
      },
    });

    const { queue } = createApp({ db: noopDb, modules: [orders, events] });

    await queue!(
      makeBatch('ORDERS_QUEUE', [makeMessage({ body: {} })]) as never,
      {},
      {},
    );
    expect(ordersHandle).toHaveBeenCalledOnce();
    expect(eventsHandle).not.toHaveBeenCalled();

    await queue!(
      makeBatch('EVENTS_QUEUE', [makeMessage({ body: {} })]) as never,
      {},
      {},
    );
    expect(eventsHandle).toHaveBeenCalledOnce();
  });

  it('throws on a batch for an unknown queue (mis-config in wrangler.jsonc)', async () => {
    const m = defineModule({
      name: 'orders',
      provides: {},
      requires: [] as const,
      consumer: {
        queue: 'ORDERS_QUEUE',
        schema: z.object({}),
        async handle() {},
      },
    });
    const { queue } = createApp({ db: noopDb, modules: [m] });

    const batch = makeBatch('NOT_REGISTERED_QUEUE', [makeMessage({ body: {} })]);
    await expect(queue!(batch as never, {}, {})).rejects.toThrow(
      /No consumer registered for queue/,
    );
  });
});
