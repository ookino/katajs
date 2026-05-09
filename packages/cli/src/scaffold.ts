import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRouteToChain, insertBeforeAnchor } from './codemod';

export type ScaffoldOptions = {
  targetDir: string;
  projectName: string;
  auth: boolean;
  monorepo: boolean;
  packageManager: 'pnpm' | 'npm' | 'bun';
  install: boolean;
  initGit: boolean;
};

type Tokens = Record<string, string>;

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.cjs',
  '.mjs',
  '.json',
  '.jsonc',
  '.md',
  '.yml',
  '.yaml',
  '.example',
  '.toml',
  '',
]);

export async function runScaffold(opts: ScaffoldOptions): Promise<void> {
  const templateName = opts.monorepo ? 'monorepo' : 'api';
  const templateRoot = resolve(getTemplatesDir(), templateName);
  if (!existsSync(templateRoot)) {
    throw new Error(`Template directory not found: ${templateRoot}`);
  }

  ensureDir(opts.targetDir);

  const tokens: Tokens = {
    PROJECT_NAME: opts.projectName,
    TODAY_ISO: new Date().toISOString().slice(0, 10),
  };

  copyTemplate(templateRoot, opts.targetDir, tokens);

  // Rename `_gitignore` → `.gitignore` and `_dev.vars.example` →
  // `.dev.vars.example` at every depth. (npm strips bare `.gitignore` from
  // package tarballs, so templates ship them underscore-prefixed.) Done
  // BEFORE auth augmentation so augment can read/append to the already-
  // renamed `.dev.vars.example`.
  renameUnderscorePrefixed(opts.targetDir);

  if (opts.auth) {
    const authVariant = opts.monorepo ? 'monorepo' : 'api';
    const authRoot = resolve(getTemplatesDir(), 'auth-snippets', authVariant);
    if (!existsSync(authRoot)) {
      throw new Error(`Auth snippet template not found: ${authRoot}`);
    }
    copyTemplate(authRoot, opts.targetDir, tokens);
    if (opts.monorepo) {
      augmentForAuthMonorepo(opts.targetDir, tokens);
    } else {
      augmentForAuth(opts.targetDir, tokens);
    }
  }

  if (opts.install) {
    runCommand(opts.packageManager, ['install'], opts.targetDir);
  }

  if (opts.initGit) {
    runCommand('git', ['init', '-q'], opts.targetDir);
    runCommand('git', ['add', '.'], opts.targetDir);
    runCommand(
      'git',
      ['commit', '-q', '-m', 'Initial commit from create-katajs'],
      opts.targetDir,
      true,
    );
  }
}

/**
 * Walk the target directory and rename any `_gitignore` to `.gitignore` and
 * `_dev.vars.example` to `.dev.vars.example`. Shallow files at the root and
 * nested files in subdirectories are handled in one pass.
 */
function renameUnderscorePrefixed(root: string): void {
  const renamableNames = new Map<string, string>([
    ['_gitignore', '.gitignore'],
    ['_dev.vars.example', '.dev.vars.example'],
  ]);

  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        // Skip node_modules just in case (shouldn't appear in a fresh scaffold).
        if (entry === 'node_modules') continue;
        stack.push(full);
      } else if (st.isFile()) {
        const target = renamableNames.get(entry);
        if (target) {
          renameSync(full, join(dir, target));
        }
      }
    }
  }
}

function getTemplatesDir(): string {
  // When bundled by tsup, import.meta.url points to dist/index.js, and
  // templates live alongside under dist/templates/. In dev (tsx), templates
  // are at packages/cli/src/templates/.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'templates'), join(here, '..', 'src', 'templates')];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

function copyTemplate(srcRoot: string, dstRoot: string, tokens: Tokens): void {
  const stack: Array<{ from: string; to: string }> = [
    { from: srcRoot, to: dstRoot },
  ];
  while (stack.length) {
    const { from, to } = stack.pop()!;
    ensureDir(to);
    for (const entry of readdirSync(from)) {
      const fromPath = join(from, entry);
      const toPath = join(to, entry);
      const st = statSync(fromPath);
      if (st.isDirectory()) {
        stack.push({ from: fromPath, to: toPath });
      } else if (st.isFile()) {
        copyFileWithTokens(fromPath, toPath, tokens);
      }
    }
  }
}

function copyFileWithTokens(from: string, to: string, tokens: Tokens): void {
  const ext = extOf(from);
  if (TEXT_EXTENSIONS.has(ext)) {
    const content = readFileSync(from, 'utf8');
    const replaced = applyTokens(content, tokens);
    writeFileSync(to, replaced);
  } else {
    cpSync(from, to);
  }
}

function applyTokens(content: string, tokens: Tokens): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] ?? `{{${key}}}`);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function extOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return '';
  return base.slice(idx);
}

function runCommand(cmd: string, args: string[], cwd: string, allowFailure = false): void {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0 && !allowFailure) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (in ${relative(process.cwd(), cwd) || '.'})`);
  }
}

/**
 * When `--auth` is set, we additionally:
 *   - merge an authModule entry into src/app.ts
 *   - append Better Auth tables to src/db/schema.ts
 *   - merge auth deps into package.json
 *   - append BETTER_AUTH_SECRET to .dev.vars.example
 *
 * The auth snippet template ships these as discrete files; this function
 * performs the targeted merges that can't be done by file-overlay alone.
 */
function augmentForAuth(targetDir: string, _tokens: Tokens): void {
  const appPath = join(targetDir, 'src', 'app.ts');
  if (existsSync(appPath)) {
    let app = readFileSync(appPath, 'utf8');
    if (!app.includes("from './modules/auth/index'")) {
      app = insertBeforeAnchor(
        app,
        'module-imports',
        "import { authModule } from './modules/auth/index';",
      );
      app = insertBeforeAnchor(app, 'modules', 'authModule,');
      // Append .route(authModule.prefix, authModule.routes) inside the routes
      // chain. The chain ends with a `,` — find the last `.route(` line in
      // the routes callback and insert after it.
      app = appendRouteToChain(app, 'authModule');
      writeFileSync(appPath, app);
    }
  }

  // Compose AuthRegistry into the augmented Registry in types.d.ts.
  const typesPath = join(targetDir, 'src', 'types.d.ts');
  if (existsSync(typesPath)) {
    let types = readFileSync(typesPath, 'utf8');
    if (!types.includes("'./modules/auth/index'")) {
      types = insertBeforeAnchor(
        types,
        'registry-imports',
        "import type { AuthRegistry } from './modules/auth/index';",
      );
      types = insertBeforeAnchor(types, 'registry', ', AuthRegistry');
      writeFileSync(typesPath, types);
    }
  }

  // Add authModule to the graph script's modules list.
  const graphScript = join(targetDir, 'scripts', 'graph.ts');
  if (existsSync(graphScript)) {
    let g = readFileSync(graphScript, 'utf8');
    if (!g.includes("'../src/modules/auth/index'")) {
      g = insertBeforeAnchor(
        g,
        'graph-imports',
        "import { authModule } from '../src/modules/auth/index';",
      );
      g = insertBeforeAnchor(g, 'graph-modules', 'authModule,');
      writeFileSync(graphScript, g);
    }
  }

  const schemaPath = join(targetDir, 'src', 'db', 'schema.ts');
  const authSchemaPath = join(targetDir, 'src', 'db', 'auth-schema.ts');
  if (existsSync(authSchemaPath) && existsSync(schemaPath)) {
    const schemaContent = readFileSync(schemaPath, 'utf8');
    if (!schemaContent.includes("export * from './auth-schema';")) {
      writeFileSync(
        schemaPath,
        schemaContent + "\nexport * from './auth-schema';\n",
      );
    }
  }

  const pkgPath = join(targetDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    pkg.dependencies = { ...pkg.dependencies, 'better-auth': '^1.0.0' };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  const dvPath = join(targetDir, '.dev.vars.example');
  if (existsSync(dvPath)) {
    const content = readFileSync(dvPath, 'utf8');
    if (!content.includes('BETTER_AUTH_SECRET')) {
      writeFileSync(
        dvPath,
        content.trimEnd() +
          '\nBETTER_AUTH_SECRET="replace-me-with-a-32-byte-secret"\nBETTER_AUTH_URL="http://localhost:8787"\n',
      );
    }
  }
}

/**
 * Monorepo variant of `augmentForAuth`. Mirrors the same anchor-based
 * mutations but the target paths are different: app.ts / types.d.ts /
 * graph.ts live under apps/api/, the schema re-export goes in
 * packages/db/src/index.ts, and apps/api/package.json gets two new deps
 * (the workspace `@{{PROJECT_NAME}}/auth` and `better-auth`).
 */
function augmentForAuthMonorepo(targetDir: string, tokens: Tokens): void {
  const projectName = tokens.PROJECT_NAME ?? '';

  const appPath = join(targetDir, 'apps', 'api', 'src', 'app.ts');
  if (existsSync(appPath)) {
    let app = readFileSync(appPath, 'utf8');
    if (!app.includes("from './modules/auth/index'")) {
      app = insertBeforeAnchor(
        app,
        'module-imports',
        "import { authModule } from './modules/auth/index';",
      );
      app = insertBeforeAnchor(app, 'modules', 'authModule,');
      app = appendRouteToChain(app, 'authModule');
      writeFileSync(appPath, app);
    }
  }

  const typesPath = join(targetDir, 'apps', 'api', 'src', 'types.d.ts');
  if (existsSync(typesPath)) {
    let types = readFileSync(typesPath, 'utf8');
    if (!types.includes("'./modules/auth/index'")) {
      types = insertBeforeAnchor(
        types,
        'registry-imports',
        "import type { AuthRegistry } from './modules/auth/index';",
      );
      types = insertBeforeAnchor(types, 'registry', ', AuthRegistry');
      writeFileSync(typesPath, types);
    }
  }

  const graphScript = join(targetDir, 'apps', 'api', 'scripts', 'graph.ts');
  if (existsSync(graphScript)) {
    let g = readFileSync(graphScript, 'utf8');
    if (!g.includes("'../src/modules/auth/index'")) {
      g = insertBeforeAnchor(
        g,
        'graph-imports',
        "import { authModule } from '../src/modules/auth/index';",
      );
      g = insertBeforeAnchor(g, 'graph-modules', 'authModule,');
      writeFileSync(graphScript, g);
    }
  }

  // Re-export auth tables from packages/db so apps consume them via @<project>/db.
  const dbIndexPath = join(targetDir, 'packages', 'db', 'src', 'index.ts');
  if (existsSync(dbIndexPath)) {
    const dbIndex = readFileSync(dbIndexPath, 'utf8');
    if (!dbIndex.includes("export * from './auth-schema';")) {
      writeFileSync(
        dbIndexPath,
        dbIndex.trimEnd() + "\nexport * from './auth-schema';\n",
      );
    }
  }

  // apps/api/package.json: add the workspace auth package + better-auth.
  const apiPkgPath = join(targetDir, 'apps', 'api', 'package.json');
  if (existsSync(apiPkgPath)) {
    const pkg = JSON.parse(readFileSync(apiPkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    pkg.dependencies = {
      ...pkg.dependencies,
      [`@${projectName}/auth`]: 'workspace:*',
      'better-auth': '^1.0.0',
    };
    writeFileSync(apiPkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  // packages/db/package.json: also pulls better-auth in (the auth-schema file is just Drizzle so it doesn't strictly need better-auth, but keeping it close is consistent).
  // Actually NOT needed — packages/db only uses drizzle-orm. Skip.

  // Bindings type — note: monorepo Bindings is in apps/api/src/app.ts (not types.d.ts).
  // Better Auth env vars are read from c.env in user code, not augmented at the type
  // level here. Keep it simple — user can add the binding declarations themselves.

  const dvPath = join(targetDir, 'apps', 'api', '.dev.vars.example');
  if (existsSync(dvPath)) {
    const content = readFileSync(dvPath, 'utf8');
    if (!content.includes('BETTER_AUTH_SECRET')) {
      writeFileSync(
        dvPath,
        content.trimEnd() +
          '\nBETTER_AUTH_SECRET="replace-me-with-a-32-byte-secret"\nBETTER_AUTH_URL="http://localhost:8787"\n',
      );
    }
  }
}
