import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addQueue } from '../src/commands/add-queue';

let tmpDir: string;

const PKG_JSON = JSON.stringify(
  { name: 'test', dependencies: { '@katajs/core': '^0.1.0' } },
  null,
  2,
);

const POSTS_INDEX = `import { defineModule } from '@katajs/core';
import { makePostService, type PostsService } from './posts.service';
// katajs:module-service-imports
import { postsRoutes } from './posts.routes';

export const postsModule = defineModule({
  name: 'posts',
  provides: {
    postService: (c): PostsService => makePostService(c),
    // katajs:module-provides
  },
  requires: [] as const,
  routes: postsRoutes,
  prefix: '/posts',
  // katajs:module-consumer
});

export type PostsRegistry = {
  postService: PostsService;
  // katajs:module-registry
};
`;

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'katajs-queue-'));
  mkdirSync(join(root, 'src', 'modules', 'posts'), { recursive: true });
  writeFileSync(join(root, 'package.json'), PKG_JSON);
  writeFileSync(join(root, 'src', 'modules', 'posts', 'index.ts'), POSTS_INDEX);
  return root;
}

beforeEach(() => {
  tmpDir = setupFixture();
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('addQueue', () => {
  it('creates the consumer file with templated content', async () => {
    await addQueue({ name: 'orders', inModule: 'posts', cwd: tmpDir });

    const file = join(tmpDir, 'src', 'modules', 'posts', 'orders.consumer.ts');
    expect(existsSync(file)).toBe(true);

    const content = readFileSync(file, 'utf8');
    expect(content).toContain('export const OrdersEventSchema');
    expect(content).toContain('export type OrdersEvent');
    expect(content).toContain('export const ordersConsumer');
    expect(content).toContain("queue: 'ORDERS_QUEUE'");
    expect(content).toContain('schema: OrdersEventSchema');
    expect(content).toContain('async handle(message, c)');
    expect(content).not.toContain('async handleBatch');
    expect(content).not.toContain('dlq:');
  });

  it('mutates the module index.ts at module-service-imports + module-consumer anchors', async () => {
    await addQueue({ name: 'orders', inModule: 'posts', cwd: tmpDir });

    const idx = readFileSync(join(tmpDir, 'src', 'modules', 'posts', 'index.ts'), 'utf8');
    expect(idx).toContain("import { ordersConsumer } from './orders.consumer';");
    expect(idx).toContain('consumer: ordersConsumer,');
    // Anchors preserved
    expect(idx).toContain('// katajs:module-service-imports');
    expect(idx).toContain('// katajs:module-consumer');
  });

  it('uses --binding to override the default binding name', async () => {
    await addQueue({
      name: 'orders',
      inModule: 'posts',
      binding: 'ORDER_EVENTS',
      cwd: tmpDir,
    });

    const file = readFileSync(
      join(tmpDir, 'src', 'modules', 'posts', 'orders.consumer.ts'),
      'utf8',
    );
    expect(file).toContain("queue: 'ORDER_EVENTS'");
    expect(file).not.toContain("queue: 'ORDERS_QUEUE'");
  });

  it('handles multi-word queue names with proper casing', async () => {
    await addQueue({ name: 'order-events', inModule: 'posts', cwd: tmpDir });

    const file = join(tmpDir, 'src', 'modules', 'posts', 'order-events.consumer.ts');
    expect(existsSync(file)).toBe(true);

    const content = readFileSync(file, 'utf8');
    expect(content).toContain('OrderEventsEventSchema');
    expect(content).toContain('orderEventsConsumer');
    expect(content).toContain("queue: 'ORDER_EVENTS_QUEUE'");

    const idx = readFileSync(join(tmpDir, 'src', 'modules', 'posts', 'index.ts'), 'utf8');
    expect(idx).toContain("from './order-events.consumer'");
    expect(idx).toContain('consumer: orderEventsConsumer,');
  });

  it('--dlq adds dlq + maxRetries fields to the consumer spec', async () => {
    await addQueue({
      name: 'orders',
      inModule: 'posts',
      dlq: 'ORDERS_DLQ',
      cwd: tmpDir,
    });

    const content = readFileSync(
      join(tmpDir, 'src', 'modules', 'posts', 'orders.consumer.ts'),
      'utf8',
    );
    expect(content).toContain("dlq: 'ORDERS_DLQ'");
    expect(content).toContain('maxRetries: 5');
  });

  it('--batch generates handleBatch instead of handle', async () => {
    await addQueue({
      name: 'orders',
      inModule: 'posts',
      batch: true,
      cwd: tmpDir,
    });

    const content = readFileSync(
      join(tmpDir, 'src', 'modules', 'posts', 'orders.consumer.ts'),
      'utf8',
    );
    expect(content).toContain('async handleBatch(batch, c)');
    expect(content).toContain('for (const message of batch.messages)');
    expect(content).not.toContain('async handle(message, c)');
  });

  it('refuses to overwrite an existing consumer file', async () => {
    const file = join(tmpDir, 'src', 'modules', 'posts', 'orders.consumer.ts');
    writeFileSync(file, '// existing');
    await expect(
      addQueue({ name: 'orders', inModule: 'posts', cwd: tmpDir }),
    ).rejects.toThrow(/already exists/);
  });

  it('throws when the target module does not exist', async () => {
    await expect(
      addQueue({ name: 'orders', inModule: 'nonexistent', cwd: tmpDir }),
    ).rejects.toThrow(/Module "nonexistent" not found/);
  });

  it('reports a fallback when module-consumer anchor is missing (no throw)', async () => {
    // Strip the anchor to simulate a customized index.ts.
    writeFileSync(
      join(tmpDir, 'src', 'modules', 'posts', 'index.ts'),
      `import { defineModule } from '@katajs/core';
// katajs:module-service-imports

export const postsModule = defineModule({
  name: 'posts',
  provides: {},
  requires: [] as const,
});
`,
    );

    // Should NOT throw — graceful fallback.
    await addQueue({ name: 'orders', inModule: 'posts', cwd: tmpDir });

    // Consumer file still created
    expect(
      existsSync(join(tmpDir, 'src', 'modules', 'posts', 'orders.consumer.ts')),
    ).toBe(true);
    // Import line was inserted (that anchor exists), but consumer field wasn't (anchor missing)
    const idx = readFileSync(join(tmpDir, 'src', 'modules', 'posts', 'index.ts'), 'utf8');
    expect(idx).toContain('ordersConsumer');
    expect(idx).not.toMatch(/^\s+consumer: ordersConsumer,/m);
  });
});
