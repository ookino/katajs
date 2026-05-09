import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addModule } from '../src/commands/add-module';

let tmpDir: string;

const FIXTURE_PKG_JSON = JSON.stringify(
  {
    name: 'test-app',
    version: '0.0.0',
    type: 'module',
    dependencies: {
      '@katajs/core': '^0.1.0',
      '@katajs/drizzle': '^0.1.0',
    },
  },
  null,
  2,
);

const FIXTURE_TYPES_DTS = `import type { DrizzleClient } from '@katajs/drizzle';
import type * as schema from './db/schema';
import type { Bindings } from './app';

import type { PostsRegistry } from './modules/posts/index';
// katajs:registry-imports

declare module '@katajs/core' {
  interface AppDb extends DrizzleClient<typeof schema> {}
  interface AppEnv extends Bindings {}
  interface Registry
    extends PostsRegistry
    // katajs:registry
  {}
}
`;

const FIXTURE_APP_TS = `import { createApp, type RequestVariables } from '@katajs/core';
import { drizzleAdapter } from '@katajs/drizzle';
import * as schema from './db/schema';

import { postsModule } from './modules/posts/index';
// katajs:module-imports

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: RequestVariables;
};

const { app } = createApp({
  bindings: {} as Bindings,
  db: drizzleAdapter({ schema }),
  modules: [
    postsModule,
    // katajs:modules
  ],
  routes: (base) =>
    base
      .route(postsModule.prefix, postsModule.routes),
  // katajs:routes
});

export default app;
export type AppType = typeof app;
`;

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'katajs-test-'));
  mkdirSync(join(root, 'src', 'modules', 'posts'), { recursive: true });
  writeFileSync(join(root, 'package.json'), FIXTURE_PKG_JSON);
  writeFileSync(join(root, 'src', 'types.d.ts'), FIXTURE_TYPES_DTS);
  writeFileSync(join(root, 'src', 'app.ts'), FIXTURE_APP_TS);
  return root;
}

beforeEach(() => {
  tmpDir = setupFixture();
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('addModule', () => {
  it('creates the module directory with all 5 files', async () => {
    await addModule({ name: 'comments', cwd: tmpDir });

    const moduleDir = join(tmpDir, 'src', 'modules', 'comments');
    for (const file of [
      'index.ts',
      'comments.service.ts',
      'comments.routes.ts',
      'comments.schema.ts',
      'comments.errors.ts',
    ]) {
      expect(readFileSync(join(moduleDir, file), 'utf8')).toBeTruthy();
    }
  });

  it('substitutes casings throughout the templates', async () => {
    await addModule({ name: 'user-profile', cwd: tmpDir });

    const idx = readFileSync(
      join(tmpDir, 'src', 'modules', 'user-profile', 'index.ts'),
      'utf8',
    );
    expect(idx).toContain("name: 'user-profile'");
    expect(idx).toContain('userProfileModule');
    expect(idx).toContain('UserProfileService');
    expect(idx).toContain('UserProfileRegistry');
    expect(idx).toContain("prefix: '/user-profile'");

    const errors = readFileSync(
      join(tmpDir, 'src', 'modules', 'user-profile', 'user-profile.errors.ts'),
      'utf8',
    );
    expect(errors).toContain('UserProfileNotFoundError');
    expect(errors).toContain("'user_profile_not_found'");
  });

  it('inserts registry import + registry extends in types.d.ts', async () => {
    await addModule({ name: 'comments', cwd: tmpDir });

    const types = readFileSync(join(tmpDir, 'src', 'types.d.ts'), 'utf8');
    expect(types).toContain(
      "import type { CommentsRegistry } from './modules/comments/index';",
    );
    expect(types).toContain(', CommentsRegistry');
    // Anchor preserved.
    expect(types).toContain('// katajs:registry-imports');
    expect(types).toContain('// katajs:registry');
  });

  it('inserts module import + modules array entry + route in app.ts', async () => {
    await addModule({ name: 'comments', cwd: tmpDir });

    const app = readFileSync(join(tmpDir, 'src', 'app.ts'), 'utf8');
    expect(app).toContain("import { commentsModule } from './modules/comments/index';");
    expect(app).toMatch(/modules:\s*\[\s*postsModule,\s*commentsModule,\s*\/\/ katajs:modules\s*\]/);
    expect(app).toContain('.route(commentsModule.prefix, commentsModule.routes),');
    // Previous .route() should NOT have a trailing comma anymore.
    expect(app).toMatch(
      /\.route\(postsModule\.prefix, postsModule\.routes\)\s*\n\s*\.route\(commentsModule\.prefix, commentsModule\.routes\),/,
    );
  });

  it('refuses to overwrite an existing module directory', async () => {
    mkdirSync(join(tmpDir, 'src', 'modules', 'comments'));
    await expect(addModule({ name: 'comments', cwd: tmpDir })).rejects.toThrow(
      /already exists/,
    );
  });

  it('throws when not in a katajs project', async () => {
    const nonProject = mkdtempSync(join(tmpdir(), 'not-katajs-'));
    try {
      await expect(addModule({ name: 'foo', cwd: nonProject })).rejects.toThrow(
        /Not in a katajs project/,
      );
    } finally {
      rmSync(nonProject, { recursive: true, force: true });
    }
  });

  it('rejects invalid names', async () => {
    await expect(addModule({ name: '', cwd: tmpDir })).rejects.toThrow();
    await expect(addModule({ name: '123', cwd: tmpDir })).rejects.toThrow(
      /must start with a letter/,
    );
  });

  it('reports a fallback (without throwing) when an anchor is missing', async () => {
    // Strip anchors from types.d.ts to simulate a customized file.
    writeFileSync(
      join(tmpDir, 'src', 'types.d.ts'),
      `interface Registry extends PostsRegistry {}\n`,
    );
    // Should NOT throw — should warn and continue.
    await addModule({ name: 'comments', cwd: tmpDir });
    // Module files still created
    expect(
      readFileSync(join(tmpDir, 'src', 'modules', 'comments', 'index.ts'), 'utf8'),
    ).toBeTruthy();
    // app.ts still mutated
    expect(readFileSync(join(tmpDir, 'src', 'app.ts'), 'utf8')).toContain(
      'commentsModule',
    );
    // types.d.ts unchanged (no anchors to insert into)
    expect(readFileSync(join(tmpDir, 'src', 'types.d.ts'), 'utf8')).not.toContain(
      'CommentsRegistry',
    );
  });
});
