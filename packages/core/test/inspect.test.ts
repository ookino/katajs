import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { defineModule } from '../src/module';
import { inspectModules } from '../src/inspect';

declare module '../src/types' {
  interface Registry {
    eventRecorder: { record: (n: string) => void };
    auditLogger: { log: (a: unknown) => void };
    postsRepo: { findById: () => null };
    postsService: { create: () => null };
  }
}

const events = defineModule({
  name: 'events',
  provides: { eventRecorder: () => ({ record: () => undefined }) },
  requires: [] as const,
});

const audit = defineModule({
  name: 'audit',
  provides: { auditLogger: () => ({ log: () => undefined }) },
  requires: ['eventRecorder'] as const,
});

const postsRoutes = new Hono()
  .get('/', (c) => c.json([]))
  .get('/:id', (c) => c.json({ id: c.req.param('id') }))
  .post('/', (c) => c.json({}))
  .delete('/:id', (c) => c.json({}));

const posts = defineModule({
  name: 'posts',
  provides: {
    postsRepo: () => ({ findById: () => null }),
    postsService: () => ({ create: () => null }),
  },
  requires: ['auditLogger'] as const,
  routes: postsRoutes,
  prefix: '/posts',
});

describe('inspectModules', () => {
  it('lists modules with provides + requires + prefix + hasRoutes', () => {
    const insp = inspectModules([events, audit, posts]);
    expect(insp.modules).toEqual([
      {
        name: 'events',
        provides: ['eventRecorder'],
        requires: [],
        prefix: undefined,
        hasRoutes: false,
      },
      {
        name: 'audit',
        provides: ['auditLogger'],
        requires: ['eventRecorder'],
        prefix: undefined,
        hasRoutes: false,
      },
      {
        name: 'posts',
        provides: ['postsRepo', 'postsService'],
        requires: ['auditLogger'],
        prefix: '/posts',
        hasRoutes: true,
      },
    ]);
  });

  it('builds the dependency edge list', () => {
    const insp = inspectModules([events, audit, posts]);
    expect(insp.edges).toEqual([
      { from: 'audit', to: 'events', via: 'eventRecorder' },
      { from: 'posts', to: 'audit', via: 'auditLogger' },
    ]);
  });

  it('flattens routes from each routed module with prefixed paths', () => {
    const insp = inspectModules([events, audit, posts]);
    // Sorted by path, then by method.
    expect(insp.routes).toEqual([
      { method: 'GET', path: '/posts', module: 'posts' },
      { method: 'POST', path: '/posts', module: 'posts' },
      { method: 'DELETE', path: '/posts/:id', module: 'posts' },
      { method: 'GET', path: '/posts/:id', module: 'posts' },
    ]);
  });

  it('emits Mermaid source with all modules + edges', () => {
    const m = inspectModules([events, audit, posts]).mermaid();
    expect(m).toMatch(/^graph TD/);
    expect(m).toContain('events["<b>events</b>');
    expect(m).toContain('posts["<b>posts</b>');
    expect(m).toContain('audit -->|eventRecorder| events');
    expect(m).toContain('posts -->|auditLogger| audit');
  });

  it('json() returns parseable structured data', () => {
    const data = JSON.parse(inspectModules([events, audit, posts]).json());
    expect(data.modules).toHaveLength(3);
    expect(data.edges).toHaveLength(2);
    expect(data.routes).toHaveLength(4);
  });

  it('html() returns a self-contained HTML document', () => {
    const html = inspectModules([events, audit, posts]).html({ title: 'Test App' });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('Test App');
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('mermaid.esm.min.mjs');
    expect(html).toContain('<code>/posts</code>');
  });

  it('surfaces consumer info on modules that declare a consumer', () => {
    const noopSchema = { parse: (v: unknown) => v as never };
    const auditConsumer = defineModule({
      name: 'audit',
      provides: { auditLogger: () => ({ log: () => undefined }) },
      requires: ['eventRecorder'] as const,
      consumer: {
        queue: 'AUDIT_QUEUE',
        dlq: 'AUDIT_DLQ',
        schema: noopSchema,
        handle: async () => {},
      },
    });
    const insp = inspectModules([events, auditConsumer]);
    const auditEntry = insp.modules.find((m) => m.name === 'audit');
    expect(auditEntry?.consumer).toEqual({
      queue: 'AUDIT_QUEUE',
      dlq: 'AUDIT_DLQ',
    });
    // events module has no consumer — should not have the field.
    expect(insp.modules.find((m) => m.name === 'events')?.consumer).toBeUndefined();
  });

  it('returns an empty producers array when none passed', () => {
    expect(inspectModules([events]).producers).toEqual([]);
  });

  it('includes producers from options, sorted by name', () => {
    const insp = inspectModules([events], {
      producers: {
        notifications: { binding: 'NOTIF_QUEUE' },
        auditEvents: { binding: 'AUDIT_QUEUE' },
      },
    });
    expect(insp.producers).toEqual([
      { name: 'auditEvents', binding: 'AUDIT_QUEUE' },
      { name: 'notifications', binding: 'NOTIF_QUEUE' },
    ]);
  });

  it('producers appear in json() output', () => {
    const data = JSON.parse(
      inspectModules([events], {
        producers: { auditEvents: { binding: 'AUDIT_QUEUE' } },
      }).json(),
    );
    expect(data.producers).toEqual([{ name: 'auditEvents', binding: 'AUDIT_QUEUE' }]);
  });
});
