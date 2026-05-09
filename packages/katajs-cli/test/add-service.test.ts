import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addService } from '../src/commands/add-service';

let tmpDir: string;

const PKG_JSON = JSON.stringify(
  {
    name: 'test-app',
    dependencies: { '@katajs/core': '^0.1.0' },
  },
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
});

export type PostsRegistry = {
  postService: PostsService;
  // katajs:module-registry
};
`;

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'katajs-svc-'));
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

describe('addService', () => {
  it('creates the service file with templated content', async () => {
    await addService({ name: 'featured', inModule: 'posts', cwd: tmpDir });

    const file = join(tmpDir, 'src', 'modules', 'posts', 'featured.service.ts');
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('export type FeaturedService');
    expect(content).toContain('export function makeFeaturedService');
    expect(content).toContain("service: 'featured'");
  });

  it('mutates the module index.ts at all three anchors', async () => {
    await addService({ name: 'featured', inModule: 'posts', cwd: tmpDir });

    const idx = readFileSync(join(tmpDir, 'src', 'modules', 'posts', 'index.ts'), 'utf8');
    expect(idx).toContain(
      "import { makeFeaturedService, type FeaturedService } from './featured.service';",
    );
    expect(idx).toContain(
      'featuredService: (c): FeaturedService => makeFeaturedService(c),',
    );
    expect(idx).toContain('featuredService: FeaturedService;');
    // Anchors preserved
    expect(idx).toContain('// katajs:module-service-imports');
    expect(idx).toContain('// katajs:module-provides');
    expect(idx).toContain('// katajs:module-registry');
  });

  it('refuses to overwrite an existing service file', async () => {
    const file = join(tmpDir, 'src', 'modules', 'posts', 'featured.service.ts');
    writeFileSync(file, '// existing');
    await expect(
      addService({ name: 'featured', inModule: 'posts', cwd: tmpDir }),
    ).rejects.toThrow(/already exists/);
  });

  it('throws when the target module does not exist', async () => {
    await expect(
      addService({ name: 'featured', inModule: 'nonexistent', cwd: tmpDir }),
    ).rejects.toThrow(/Module "nonexistent" not found/);
  });

  it('handles multi-word service names with proper casing', async () => {
    await addService({ name: 'featured-list', inModule: 'posts', cwd: tmpDir });

    const file = join(tmpDir, 'src', 'modules', 'posts', 'featured-list.service.ts');
    expect(existsSync(file)).toBe(true);

    const idx = readFileSync(join(tmpDir, 'src', 'modules', 'posts', 'index.ts'), 'utf8');
    expect(idx).toContain('FeaturedListService');
    expect(idx).toContain('featuredListService:');
    expect(idx).toContain("'./featured-list.service'");
  });
});
