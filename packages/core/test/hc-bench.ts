import { Hono } from 'hono';
import { hc } from 'hono/client';

const minimal = new Hono().get('/hello', (c) => c.json({ ok: true }));
const cMin = hc<typeof minimal>('http://example.com');
type Mid = typeof cMin;
type Hello = typeof cMin.hello;
type Get = typeof cMin.hello.$get;

const _: Get = null as any;
export { _ };
