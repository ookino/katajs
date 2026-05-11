import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDatabase, __rewriteDbRefs as rewriteDbRefs } from '../src/commands/add-database';

let tmpDir: string;

const PKG_JSON = JSON.stringify(
  {
    name: 'test-app',
    version: '0.0.0',
    type: 'module',
    dependencies: { '@katajs/core': '^0.1.0', '@katajs/drizzle': '^0.1.0' },
  },
  null,
  2,
);

const TYPES_DTS = `import type { DrizzleClient } from '@katajs/drizzle';
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

const APP_TS = `import { createApp, type RequestVariables } from '@katajs/core';
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

const POSTS_INDEX = `import { defineModule } from '@katajs/core';
import { makePostRepository } from './posts.repository';
import { makePostService } from './posts.service';

export const postsModule = defineModule({
  name: 'posts',
  provides: {
    postRepository: (c) => makePostRepository(c.db),
    postService: (c) => makePostService(c),
  },
  requires: [] as const,
  prefix: '/posts',
});
`;

const POSTS_SERVICE = `export function makePostService(c) {
  return {
    async create(input) {
      return c.withTransaction(async (tx) => {
        return tx.resolve('postRepository').insert(input);
      });
    },
  };
}
`;

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'katajs-adddb-'));
  mkdirSync(join(root, 'src', 'modules', 'posts'), { recursive: true });
  mkdirSync(join(root, 'src', 'db'), { recursive: true });
  writeFileSync(join(root, 'package.json'), PKG_JSON);
  writeFileSync(join(root, 'src', 'types.d.ts'), TYPES_DTS);
  writeFileSync(join(root, 'src', 'app.ts'), APP_TS);
  writeFileSync(join(root, 'src', 'db', 'schema.ts'), '// app schema\n');
  writeFileSync(join(root, 'src', 'modules', 'posts', 'index.ts'), POSTS_INDEX);
  writeFileSync(join(root, 'src', 'modules', 'posts', 'posts.service.ts'), POSTS_SERVICE);
  return root;
}

const read = (p: string) => readFileSync(join(tmpDir, p), 'utf8');

beforeEach(() => {
  tmpDir = setupFixture();
});
afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('addDatabase — first call (single → map)', () => {
  it('scaffolds the schema stub with casings applied', async () => {
    await addDatabase({ name: 'analytics', cwd: tmpDir });
    const stub = read('src/db/analytics-schema.ts');
    expect(stub).toContain('analyticsItems');
    expect(stub).toContain("pgTable('analytics_items'");
    expect(stub).toContain('drizzle-orm/pg-core');
  });

  it('converts db: adapter → a named map with the // katajs:databases anchor', async () => {
    await addDatabase({ name: 'analytics', cwd: tmpDir });
    const app = read('src/app.ts');
    expect(app).toMatch(/db:\s*\{/);
    expect(app).toContain('main: drizzleAdapter({ schema }),');
    expect(app).toContain(
      "analytics: drizzleAdapter({ schema: analyticsSchema, bindingName: 'ANALYTICS_HD' }),",
    );
    expect(app).toContain('// katajs:databases');
    expect(app).toContain("import * as analyticsSchema from './db/analytics-schema';");
    expect(app).toContain('ANALYTICS_HD: Hyperdrive;');
    // original HYPERDRIVE binding kept
    expect(app).toContain('HYPERDRIVE: Hyperdrive;');
  });

  it('rewrites the AppDb augmentation to the map shape with the registry anchor', async () => {
    await addDatabase({ name: 'analytics', cwd: tmpDir });
    const types = read('src/types.d.ts');
    expect(types).toContain("import type * as analyticsSchema from './db/analytics-schema';");
    expect(types).toContain('interface AppDb {');
    expect(types).toContain('main: DrizzleClient<typeof schema>;');
    expect(types).toContain('analytics: DrizzleClient<typeof analyticsSchema>;');
    expect(types).toContain('// katajs:databases-registry');
    expect(types).not.toContain('AppDb extends DrizzleClient');
  });

  it('rewrites c.db → c.db.main and withTransaction( → withTransaction(\'main\', across modules', async () => {
    await addDatabase({ name: 'analytics', cwd: tmpDir });
    const idx = read('src/modules/posts/index.ts');
    expect(idx).toContain('makePostRepository(c.db.main)');
    expect(idx).not.toMatch(/makePostRepository\(c\.db\)/);
    const svc = read('src/modules/posts/posts.service.ts');
    expect(svc).toContain("c.withTransaction('main', async (tx) =>");
  });

  it('--no-rewrite leaves module c.db references alone', async () => {
    await addDatabase({ name: 'analytics', cwd: tmpDir, noRewrite: true });
    expect(read('src/modules/posts/index.ts')).toContain('makePostRepository(c.db)');
    // ...but app.ts + types.d.ts are still converted.
    expect(read('src/app.ts')).toMatch(/db:\s*\{/);
  });
});

describe('addDatabase — second call (map → map)', () => {
  it('appends a new entry at the anchors without re-rewriting modules', async () => {
    await addDatabase({ name: 'analytics', cwd: tmpDir });
    const idxAfterFirst = read('src/modules/posts/index.ts');

    await addDatabase({ name: 'sessions', cwd: tmpDir });
    const app = read('src/app.ts');
    expect(app).toContain('main: drizzleAdapter({ schema }),');
    expect(app).toContain(
      "analytics: drizzleAdapter({ schema: analyticsSchema, bindingName: 'ANALYTICS_HD' }),",
    );
    expect(app).toContain(
      "sessions: drizzleAdapter({ schema: sessionsSchema, bindingName: 'SESSIONS_HD' }),",
    );
    expect(app).toContain('// katajs:databases'); // anchor still there

    const types = read('src/types.d.ts');
    expect(types).toContain('sessions: DrizzleClient<typeof sessionsSchema>;');

    // Modules untouched the second time — c.db.main was already rewritten once,
    // it must not become c.db.main.main.
    expect(read('src/modules/posts/index.ts')).toBe(idxAfterFirst);
    expect(read('src/modules/posts/index.ts')).not.toContain('c.db.main.main');
  });
});

describe('addDatabase — guards', () => {
  it("refuses the reserved name 'main'", async () => {
    await expect(addDatabase({ name: 'main', cwd: tmpDir })).rejects.toThrow(/reserved/i);
  });

  it('refuses to overwrite an existing schema file', async () => {
    writeFileSync(join(tmpDir, 'src', 'db', 'analytics-schema.ts'), '// existing\n');
    await expect(addDatabase({ name: 'analytics', cwd: tmpDir })).rejects.toThrow(/already exists/);
  });

  it('throws when not in a katajs project', async () => {
    const nonProject = mkdtempSync(join(tmpdir(), 'not-katajs-'));
    try {
      await expect(addDatabase({ name: 'analytics', cwd: nonProject })).rejects.toThrow(
        /Not in a katajs project/,
      );
    } finally {
      rmSync(nonProject, { recursive: true, force: true });
    }
  });

  it('still scaffolds the schema + reports fallbacks when app.ts has no recognizable db: line', async () => {
    writeFileSync(
      join(tmpDir, 'src', 'app.ts'),
      `import { createApp } from '@katajs/core';\nconst { app } = createApp({ db: someCustomThing, modules: [] });\nexport default app;\n`,
    );
    // Should not throw.
    await addDatabase({ name: 'analytics', cwd: tmpDir });
    expect(read('src/db/analytics-schema.ts')).toBeTruthy();
  });
});

describe('rewriteDbRefs', () => {
  it('rewrites bare and dotted c.db, c.var.db, c.var.container.db', () => {
    const { text } = rewriteDbRefs(
      [
        'const a = c.db;',
        'const b = c.db.query.posts;',
        'const d = c.var.db;',
        'const e = c.var.db.select();',
        'const f = c.var.container.db;',
        'const g = c.var.container.db.transaction(fn);',
      ].join('\n'),
    );
    expect(text).toContain('const a = c.db.main;');
    expect(text).toContain('const b = c.db.main.query.posts;');
    expect(text).toContain('const d = c.var.db.main;');
    expect(text).toContain('const e = c.var.db.main.select();');
    expect(text).toContain('const f = c.var.container.db.main;');
    expect(text).toContain('const g = c.var.container.db.main.transaction(fn);');
  });

  it('rewrites .withTransaction( but leaves an already-named one alone', () => {
    const { text } = rewriteDbRefs(
      "a.withTransaction(async (t) => {});\nb.withTransaction('main', async (t) => {});\n",
    );
    expect(text).toContain("a.withTransaction('main', async (t) => {});");
    expect(text).toContain("b.withTransaction('main', async (t) => {});"); // unchanged
  });

  it('is idempotent — running twice does not double-rewrite', () => {
    const once = rewriteDbRefs('makeRepo(c.db); c.db.query.x; c.withTransaction(fn);').text;
    const twice = rewriteDbRefs(once).text;
    expect(twice).toBe(once);
    expect(twice).not.toContain('c.db.main.main');
  });

  it('does not touch lookalikes (abc.db, someDb, account.db)', () => {
    const src = 'const x = abc.db; const y = someDb; const z = account.db;';
    expect(rewriteDbRefs(src).text).toBe(src);
  });
});
