import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRoute } from '../src/commands/add-route';

let tmpDir: string;

const PKG_JSON = JSON.stringify(
  { name: 'test', dependencies: { '@katajs/core': '^0.1.0' } },
  null,
  2,
);

const POSTS_ROUTES = `import { Hono } from 'hono';
import type { AppEnv } from '../../app';

export const postsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    return c.json({ posts: [] });
  })
  // katajs:module-routes
  ;
`;

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'katajs-route-'));
  mkdirSync(join(root, 'src', 'modules', 'posts'), { recursive: true });
  writeFileSync(join(root, 'package.json'), PKG_JSON);
  writeFileSync(join(root, 'src', 'modules', 'posts', 'posts.routes.ts'), POSTS_ROUTES);
  return root;
}

beforeEach(() => {
  tmpDir = setupFixture();
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('addRoute', () => {
  it('appends a new .post() handler before the anchor', async () => {
    await addRoute({ method: 'post', path: '/comments', inModule: 'posts', cwd: tmpDir });

    const content = readFileSync(
      join(tmpDir, 'src', 'modules', 'posts', 'posts.routes.ts'),
      'utf8',
    );
    expect(content).toContain(".post('/comments', async (c)");
    expect(content).toContain('// TODO: implement POST /comments');
    expect(content).toContain('// katajs:module-routes');
    // The order: existing .get() then new .post() then the anchor.
    const idxGet = content.indexOf(".get('/'");
    const idxPost = content.indexOf(".post('/comments'");
    const idxAnchor = content.indexOf('// katajs:module-routes');
    expect(idxGet).toBeLessThan(idxPost);
    expect(idxPost).toBeLessThan(idxAnchor);
  });

  it('normalizes method to lowercase', async () => {
    await addRoute({ method: 'POST', path: '/x', inModule: 'posts', cwd: tmpDir });
    const content = readFileSync(
      join(tmpDir, 'src', 'modules', 'posts', 'posts.routes.ts'),
      'utf8',
    );
    expect(content).toContain(".post('/x'");
  });

  it('rejects invalid HTTP methods', async () => {
    await expect(
      addRoute({ method: 'fetch', path: '/x', inModule: 'posts', cwd: tmpDir }),
    ).rejects.toThrow(/Invalid HTTP method/);
  });

  it('rejects paths that don’t start with /', async () => {
    await expect(
      addRoute({ method: 'get', path: 'no-slash', inModule: 'posts', cwd: tmpDir }),
    ).rejects.toThrow(/must start with "\/"/);
  });

  it('throws when the routes file does not exist', async () => {
    await expect(
      addRoute({ method: 'get', path: '/x', inModule: 'audit', cwd: tmpDir }),
    ).rejects.toThrow(/Routes file not found/);
  });
});
