import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp, ValidationError, type TypedQueue } from '../src';

// Test-scoped queues registry augmentation. Lets c.var.queues.X.send(body)
// typecheck against these synthetic shapes inside this test file.
declare module '../src' {
  interface QueuesRegistry {
    orders: TypedQueue<{ type: 'order.placed'; orderId: string }>;
    notifications: TypedQueue<{ type: string; userId: string }>;
    events: TypedQueue<{ id: string }>;
  }
}

const noopDb = { create: () => ({}) };

describe('createApp queues (typed producer wrapper)', () => {
  const OrderEventSchema = z.object({
    type: z.literal('order.placed'),
    orderId: z.string().uuid(),
  });

  it('exposes c.var.queues from inside a route', async () => {
    let observed: unknown;
    const send = vi.fn().mockResolvedValue(undefined);

    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          await c.var.queues.orders.send({
            type: 'order.placed',
            orderId: '550e8400-e29b-41d4-a716-446655440000',
          } as never);
          observed = 'sent';
          return c.json({ ok: true });
        }),
    });

    const env = { ORDER_QUEUE: { send } };
    const res = await app.request('/probe', { method: 'POST' }, env);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({ type: 'order.placed' });
    expect(observed).toBe('sent');
  });

  it('validates body against the schema before sending', async () => {
    const send = vi.fn();

    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          await c.var.queues.orders.send({
            type: 'order.placed',
            orderId: 'not-a-uuid',
          } as never);
          return c.json({ ok: true });
        }),
    });

    const env = { ORDER_QUEUE: { send } };
    const res = await app.request('/probe', { method: 'POST' }, env);

    // ValidationError → 400 via errorMapper
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string[] }[] };
    expect(body.error).toBe('validation_failed');
    expect(body.issues[0]!.path[0]).toBe('queues.orders');
    expect(send).not.toHaveBeenCalled();
  });

  it('throws a clear error when the binding is not on env at runtime', async () => {
    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          await c.var.queues.orders.send({
            type: 'order.placed',
            orderId: '550e8400-e29b-41d4-a716-446655440000',
          } as never);
          return c.json({ ok: true });
        }),
    });

    // No ORDER_QUEUE on env
    const res = await app.request('/probe', { method: 'POST' }, {});
    expect(res.status).toBe(500);
  });

  it('routes multiple queue declarations to the right bindings', async () => {
    const ordersSend = vi.fn().mockResolvedValue(undefined);
    const notificationsSend = vi.fn().mockResolvedValue(undefined);

    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
        notifications: {
          binding: 'NOTIFICATIONS_QUEUE',
          schema: z.object({ type: z.string(), userId: z.string() }),
        },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          await c.var.queues.orders.send({
            type: 'order.placed',
            orderId: '550e8400-e29b-41d4-a716-446655440000',
          } as never);
          await c.var.queues.notifications.send({
            type: 'welcome',
            userId: 'u1',
          } as never);
          return c.json({ ok: true });
        }),
    });

    const env = {
      ORDER_QUEUE: { send: ordersSend },
      NOTIFICATIONS_QUEUE: { send: notificationsSend },
    };
    await app.request('/probe', { method: 'POST' }, env);

    expect(ordersSend).toHaveBeenCalledOnce();
    expect(notificationsSend).toHaveBeenCalledOnce();
  });

  it('sendBatch validates each message and uses the binding sendBatch when available', async () => {
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);

    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        events: { binding: 'EVENTS_QUEUE', schema: z.object({ id: z.string() }) },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          await c.var.queues.events.sendBatch([
            { id: 'a' },
            { id: 'b' },
            { id: 'c' },
          ] as never);
          return c.json({ ok: true });
        }),
    });

    const env = { EVENTS_QUEUE: { send, sendBatch } };
    const res = await app.request('/probe', { method: 'POST' }, env);
    expect(res.status).toBe(200);
    expect(sendBatch).toHaveBeenCalledOnce();
    // Cloudflare expects [{ body }, ...]
    expect(sendBatch.mock.calls[0]![0]).toEqual([
      { body: { id: 'a' } },
      { body: { id: 'b' } },
      { body: { id: 'c' } },
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it('sendBatch falls back to per-message send when binding has no sendBatch', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        events: { binding: 'EVENTS_QUEUE', schema: z.object({ id: z.string() }) },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          await c.var.queues.events.sendBatch([
            { id: 'a' },
            { id: 'b' },
          ] as never);
          return c.json({ ok: true });
        }),
    });

    const env = { EVENTS_QUEUE: { send } }; // no sendBatch
    await app.request('/probe', { method: 'POST' }, env);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('c.var.queues is empty when no queues config is provided', async () => {
    let captured: object | undefined;
    const { app } = createApp({
      db: noopDb,
      modules: [],
      // no queues
      routes: (base) =>
        base.get('/probe', async (c) => {
          captured = c.var.queues;
          return c.json({ ok: true });
        }),
    });

    await app.request('/probe', undefined, {});
    expect(captured).toEqual({});
  });

  it('ValidationError on send is catchable from user code', async () => {
    let caught: ValidationError | undefined;
    const send = vi.fn();

    const { app } = createApp({
      db: noopDb,
      modules: [],
      queues: {
        orders: { binding: 'ORDER_QUEUE', schema: OrderEventSchema },
      },
      routes: (base) =>
        base.post('/probe', async (c) => {
          try {
            await c.var.queues.orders.send({ type: 'wrong' } as never);
          } catch (err) {
            if (err instanceof ValidationError) caught = err;
          }
          return c.json({ ok: true });
        }),
    });

    const env = { ORDER_QUEUE: { send } };
    await app.request('/probe', { method: 'POST' }, env);
    expect(caught).toBeInstanceOf(ValidationError);
    expect(send).not.toHaveBeenCalled();
  });
});
