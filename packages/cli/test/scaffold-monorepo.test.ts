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

  describe('--monorepo --auth', () => {
    it('scaffolds packages/auth + packages/db/auth-schema + apps/api/modules/auth', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      // packages/auth
      expect(existsSync(join(projectDir, 'packages/auth/package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'packages/auth/src/auth.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'packages/auth/src/index.ts'))).toBe(true);

      // packages/db/auth-schema
      expect(existsSync(join(projectDir, 'packages/db/src/auth-schema.ts'))).toBe(true);

      // apps/api/modules/auth (4 files)
      for (const f of [
        'index.ts',
        'auth.errors.ts',
        'auth.middleware.ts',
        'auth.routes.ts',
      ]) {
        expect(
          existsSync(join(projectDir, `apps/api/src/modules/auth/${f}`)),
          `missing apps/api/src/modules/auth/${f}`,
        ).toBe(true);
      }
    });

    it('substitutes the project name into @<project>/auth and @<project>/db references', async () => {
      const projectDir = join(tmpDir, 'cool-thing');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'cool-thing',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const authPkg = JSON.parse(
        readFileSync(join(projectDir, 'packages/auth/package.json'), 'utf8'),
      );
      expect(authPkg.name).toBe('@cool-thing/auth');
      expect(authPkg.dependencies['@cool-thing/db']).toBe('workspace:*');

      const authTs = readFileSync(
        join(projectDir, 'packages/auth/src/auth.ts'),
        'utf8',
      );
      expect(authTs).toContain("from '@cool-thing/db'");

      const authModuleIdx = readFileSync(
        join(projectDir, 'apps/api/src/modules/auth/index.ts'),
        'utf8',
      );
      expect(authModuleIdx).toContain("from '@cool-thing/auth'");
    });

    it('mutates apps/api/src/app.ts to include authModule', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const app = readFileSync(join(projectDir, 'apps/api/src/app.ts'), 'utf8');
      expect(app).toContain("import { authModule } from './modules/auth/index';");
      expect(app).toMatch(/modules:\s*\[[^\]]*authModule[^\]]*\]/);
      expect(app).toContain('.route(authModule.prefix, authModule.routes)');
    });

    it('mutates apps/api/src/types.d.ts to compose AuthRegistry', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const types = readFileSync(
        join(projectDir, 'apps/api/src/types.d.ts'),
        'utf8',
      );
      expect(types).toContain(
        "import type { AuthRegistry } from './modules/auth/index';",
      );
      expect(types).toContain(', AuthRegistry');
    });

    it('re-exports auth-schema from packages/db/src/index.ts', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const dbIndex = readFileSync(
        join(projectDir, 'packages/db/src/index.ts'),
        'utf8',
      );
      expect(dbIndex).toContain("export * from './auth-schema';");
    });

    it('adds @<project>/auth + better-auth to apps/api/package.json', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const apiPkg = JSON.parse(
        readFileSync(join(projectDir, 'apps/api/package.json'), 'utf8'),
      );
      expect(apiPkg.dependencies['@my-app/auth']).toBe('workspace:*');
      expect(apiPkg.dependencies['better-auth']).toMatch(/^\^/);
    });

    it('appends BETTER_AUTH_SECRET / URL to apps/api/.dev.vars.example', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: true,
        monorepo: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const dvVars = readFileSync(
        join(projectDir, 'apps/api/.dev.vars.example'),
        'utf8',
      );
      expect(dvVars).toContain('BETTER_AUTH_SECRET=');
      expect(dvVars).toContain('BETTER_AUTH_URL=');
    });
  });

  describe('--monorepo --worker', () => {
    it('scaffolds apps/worker/ with the expected files', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      for (const f of [
        'apps/worker/package.json',
        'apps/worker/tsconfig.json',
        'apps/worker/wrangler.jsonc',
        'apps/worker/.gitignore',
        'apps/worker/.dev.vars.example',
        'apps/worker/src/index.ts',
        'apps/worker/src/app.ts',
        'apps/worker/src/types.d.ts',
        'apps/worker/src/modules/example-consumer/index.ts',
        'apps/worker/src/modules/example-consumer/example.consumer.ts',
        'apps/worker/src/modules/example-consumer/example.service.ts',
      ]) {
        expect(existsSync(join(projectDir, f)), `missing ${f}`).toBe(true);
      }
    });

    it('substitutes the project name into worker package + imports', async () => {
      const projectDir = join(tmpDir, 'cool-thing');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'cool-thing',
        auth: false,
        monorepo: true,
        worker: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const workerPkg = JSON.parse(
        readFileSync(join(projectDir, 'apps/worker/package.json'), 'utf8'),
      );
      expect(workerPkg.name).toBe('@cool-thing/worker');
      expect(workerPkg.dependencies['@cool-thing/db']).toBe('workspace:*');

      const workerApp = readFileSync(
        join(projectDir, 'apps/worker/src/app.ts'),
        'utf8',
      );
      expect(workerApp).toContain("from '@cool-thing/db'");

      const workerTypes = readFileSync(
        join(projectDir, 'apps/worker/src/types.d.ts'),
        'utf8',
      );
      expect(workerTypes).toContain("from '@cool-thing/db'");
    });

    it('worker is queue-only — no Hono routes wiring', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const workerIndex = readFileSync(
        join(projectDir, 'apps/worker/src/index.ts'),
        'utf8',
      );
      expect(workerIndex).toContain('export default { queue }');
      expect(workerIndex).not.toContain('fetch:');

      const workerApp = readFileSync(
        join(projectDir, 'apps/worker/src/app.ts'),
        'utf8',
      );
      expect(workerApp).toContain('const { queue } = createApp');
      // No `routes:` callback — worker has no HTTP surface.
      expect(workerApp).not.toMatch(/^\s+routes:\s*\(/m);
    });

    it('updates root package.json scripts with deploy:worker', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const rootPkg = JSON.parse(
        readFileSync(join(projectDir, 'package.json'), 'utf8'),
      );
      expect(rootPkg.scripts['deploy:worker']).toBe(
        'pnpm --filter @my-app/worker deploy',
      );
      expect(rootPkg.scripts['deploy:api']).toBe(
        'pnpm --filter @my-app/api deploy',
      );
      expect(rootPkg.scripts.deploy).toContain('@my-app/worker deploy');
    });

    it('throws when --worker is set without --monorepo', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await expect(
        runScaffold({
          targetDir: projectDir,
          projectName: 'my-app',
          auth: false,
          monorepo: false,
          worker: true,
          packageManager: 'pnpm',
          install: false,
          initGit: false,
        }),
      ).rejects.toThrow(/--worker requires --monorepo/);
    });

    it('worker example-consumer uses defineConsumer (full body inference)', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const consumer = readFileSync(
        join(projectDir, 'apps/worker/src/modules/example-consumer/example.consumer.ts'),
        'utf8',
      );
      expect(consumer).toContain('defineConsumer');
      expect(consumer).toContain('async handle(message, c)');
    });

    it('renames the worker directory when a custom workerName is provided', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        workerName: 'payout-worker',
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      // Custom-named directory exists; the default 'apps/worker/' does not.
      expect(existsSync(join(projectDir, 'apps/payout-worker/package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'apps/worker'))).toBe(false);
    });

    it('substitutes WORKER_NAME into package + wrangler', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        workerName: 'reconcile',
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const pkg = JSON.parse(
        readFileSync(join(projectDir, 'apps/reconcile/package.json'), 'utf8'),
      );
      expect(pkg.name).toBe('@my-app/reconcile');

      const wrangler = readFileSync(
        join(projectDir, 'apps/reconcile/wrangler.jsonc'),
        'utf8',
      );
      expect(wrangler).toContain('"name": "my-app-reconcile"');
    });

    it('root package.json gets deploy:<workerName> script', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await runScaffold({
        targetDir: projectDir,
        projectName: 'my-app',
        auth: false,
        monorepo: true,
        worker: true,
        workerName: 'notifications',
        packageManager: 'pnpm',
        install: false,
        initGit: false,
      });

      const rootPkg = JSON.parse(
        readFileSync(join(projectDir, 'package.json'), 'utf8'),
      );
      expect(rootPkg.scripts['deploy:notifications']).toBe(
        'pnpm --filter @my-app/notifications deploy',
      );
      expect(rootPkg.scripts.deploy).toContain('@my-app/notifications deploy');
    });

    it('rejects invalid worker names', async () => {
      const projectDir = join(tmpDir, 'my-app');

      await expect(
        runScaffold({
          targetDir: projectDir,
          projectName: 'my-app',
          auth: false,
          monorepo: true,
          worker: true,
          workerName: 'Invalid Name',
          packageManager: 'pnpm',
          install: false,
          initGit: false,
        }),
      ).rejects.toThrow(/Invalid worker name/);
    });
  });
});
