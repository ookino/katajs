import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runScaffold } from '../src/scaffold';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'katajs-mono-scaffold-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('--monorepo scaffold', () => {
  it('produces the expected workspace tree', async () => {
    const projectDir = join(tmpDir, 'my-app');

    await runScaffold({
      targetDir: projectDir,
      projectName: 'my-app',
      auth: false,
      monorepo: true,
      packageManager: 'pnpm',
      install: false,
      initGit: false,
    });

    // Root files
    for (const f of [
      'package.json',
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.base.json',
      'README.md',
      '.gitignore',
      '.github/workflows/deploy.yml',
    ]) {
      expect(existsSync(join(projectDir, f)), `missing ${f}`).toBe(true);
    }

    // apps/api files
    for (const f of [
      'apps/api/package.json',
      'apps/api/tsconfig.json',
      'apps/api/wrangler.jsonc',
      'apps/api/.gitignore',
      'apps/api/.dev.vars.example',
      'apps/api/src/app.ts',
      'apps/api/src/index.ts',
      'apps/api/src/types.d.ts',
      'apps/api/src/modules/posts/index.ts',
      'apps/api/src/modules/posts/posts.repository.ts',
      'apps/api/scripts/graph.ts',
    ]) {
      expect(existsSync(join(projectDir, f)), `missing ${f}`).toBe(true);
    }

    // packages/db files
    for (const f of [
      'packages/db/package.json',
      'packages/db/tsconfig.json',
      'packages/db/drizzle.config.ts',
      'packages/db/src/schema.ts',
      'packages/db/src/index.ts',
    ]) {
      expect(existsSync(join(projectDir, f)), `missing ${f}`).toBe(true);
    }

    // packages/api-client files
    for (const f of [
      'packages/api-client/package.json',
      'packages/api-client/tsconfig.json',
      'packages/api-client/src/index.ts',
    ]) {
      expect(existsSync(join(projectDir, f)), `missing ${f}`).toBe(true);
    }
  });

  it('substitutes the project name into package scopes', async () => {
    const projectDir = join(tmpDir, 'cool-thing');

    await runScaffold({
      targetDir: projectDir,
      projectName: 'cool-thing',
      auth: false,
      monorepo: true,
      packageManager: 'pnpm',
      install: false,
      initGit: false,
    });

    const apiPkg = JSON.parse(
      readFileSync(join(projectDir, 'apps/api/package.json'), 'utf8'),
    );
    expect(apiPkg.name).toBe('@cool-thing/api');
    expect(apiPkg.dependencies['@cool-thing/db']).toBe('workspace:*');

    const dbPkg = JSON.parse(
      readFileSync(join(projectDir, 'packages/db/package.json'), 'utf8'),
    );
    expect(dbPkg.name).toBe('@cool-thing/db');

    const clientPkg = JSON.parse(
      readFileSync(join(projectDir, 'packages/api-client/package.json'), 'utf8'),
    );
    expect(clientPkg.name).toBe('@cool-thing/api-client');

    const rootPkg = JSON.parse(
      readFileSync(join(projectDir, 'package.json'), 'utf8'),
    );
    expect(rootPkg.name).toBe('cool-thing');
    expect(rootPkg.scripts['db:generate']).toContain('@cool-thing/db');
    expect(rootPkg.scripts.deploy).toContain('@cool-thing/api');
  });

  it('imports the schema from the db package, not a local db/ folder', async () => {
    const projectDir = join(tmpDir, 'my-app');

    await runScaffold({
      targetDir: projectDir,
      projectName: 'my-app',
      auth: false,
      monorepo: true,
      packageManager: 'pnpm',
      install: false,
      initGit: false,
    });

    const repo = readFileSync(
      join(projectDir, 'apps/api/src/modules/posts/posts.repository.ts'),
      'utf8',
    );
    expect(repo).toContain("from '@my-app/db'");
    expect(repo).not.toContain("from '../../db/schema'");

    const types = readFileSync(join(projectDir, 'apps/api/src/types.d.ts'), 'utf8');
    expect(types).toContain("from '@my-app/db'");
    expect(types).not.toContain("from './db/schema'");

    // No local db/ directory in apps/api
    expect(existsSync(join(projectDir, 'apps/api/src/db'))).toBe(false);
  });

  it('renames _gitignore at every depth (root + apps/api)', async () => {
    const projectDir = join(tmpDir, 'my-app');

    await runScaffold({
      targetDir: projectDir,
      projectName: 'my-app',
      auth: false,
      monorepo: true,
      packageManager: 'pnpm',
      install: false,
      initGit: false,
    });

    // Both renamed
    expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(projectDir, 'apps/api/.gitignore'))).toBe(true);
    expect(existsSync(join(projectDir, 'apps/api/.dev.vars.example'))).toBe(true);

    // None of the underscore-prefixed originals remain
    expect(existsSync(join(projectDir, '_gitignore'))).toBe(false);
    expect(existsSync(join(projectDir, 'apps/api/_gitignore'))).toBe(false);
    expect(existsSync(join(projectDir, 'apps/api/_dev.vars.example'))).toBe(false);
  });

  it('api-client is generic over AppType (no workspace dep on apps/api)', async () => {
    const projectDir = join(tmpDir, 'my-app');

    await runScaffold({
      targetDir: projectDir,
      projectName: 'my-app',
      auth: false,
      monorepo: true,
      packageManager: 'pnpm',
      install: false,
      initGit: false,
    });

    const clientPkg = JSON.parse(
      readFileSync(join(projectDir, 'packages/api-client/package.json'), 'utf8'),
    );
    // No workspace coupling
    expect(clientPkg.devDependencies['@my-app/api']).toBeUndefined();
    expect(clientPkg.dependencies['@my-app/api']).toBeUndefined();

    const clientSrc = readFileSync(
      join(projectDir, 'packages/api-client/src/index.ts'),
      'utf8',
    );
    expect(clientSrc).toContain('createApiClient<App extends AnyHono>');
    // No real import statement (the JSDoc example comment doesn't count).
    expect(clientSrc).not.toMatch(/^import .* from '@my-app\/api'/m);
  });

  it('warns and skips auth scaffolding when --auth + --monorepo', async () => {
    const projectDir = join(tmpDir, 'my-app');
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    try {
      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });
    } finally {
      console.warn = origWarn;
    }

    expect(warnings.some((w) => w.includes('--auth + --monorepo'))).toBe(true);
    // No auth module was scaffolded
    expect(existsSync(join(projectDir, 'apps/api/src/modules/auth'))).toBe(false);
  });
});
