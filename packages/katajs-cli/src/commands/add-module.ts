import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { cyan, dim, green, red, yellow } from 'kolorist';
import {
  AnchorMissingError,
  appendRouteToChain,
  insertBeforeAnchor,
} from '../codemod';
import { findKatajsProject } from '../utils/project';
import { normalizeName, type Casings } from '../utils/text';

export type AddModuleOptions = {
  /** Module name in any reasonable form: kebab, camel, snake. */
  name: string;
  /** Optional working directory; defaults to process.cwd(). */
  cwd?: string;
};

export async function addModule(opts: AddModuleOptions): Promise<void> {
  const project = findKatajsProject(opts.cwd);
  const casings = normalizeName(opts.name);
  const moduleDir = join(project.srcDir, 'modules', casings.kebab);

  if (existsSync(moduleDir)) {
    throw new Error(
      `Module directory already exists: ${moduleDir}\nRefusing to overwrite. Delete the directory first or pick a different name.`,
    );
  }

  // 1. Generate the module files from templates.
  generateModuleFiles(moduleDir, casings);

  // 2. Mutate types.d.ts and app.ts via anchors. Each step is best-effort —
  // if an anchor is missing, we report it and print the snippet so the user
  // can paste manually instead of failing the whole operation.
  const fallbacks: string[] = [];

  applyMutation({
    file: join(project.srcDir, 'types.d.ts'),
    fn: (content) => {
      const c1 = insertBeforeAnchor(
        content,
        'registry-imports',
        `import type { ${casings.pascal}Registry } from './modules/${casings.kebab}/index';`,
      );
      return insertBeforeAnchor(c1, 'registry', `, ${casings.pascal}Registry`);
    },
    onFallback: (msg) => fallbacks.push(msg),
    snippet: () =>
      [
        `// In ${join(project.srcDir, 'types.d.ts')}:`,
        `import type { ${casings.pascal}Registry } from './modules/${casings.kebab}/index';`,
        `// Add to the Registry interface extends list:`,
        `, ${casings.pascal}Registry`,
      ].join('\n'),
  });

  applyMutation({
    file: join(project.srcDir, 'app.ts'),
    fn: (content) => {
      const c1 = insertBeforeAnchor(
        content,
        'module-imports',
        `import { ${casings.camel}Module } from './modules/${casings.kebab}/index';`,
      );
      const c2 = insertBeforeAnchor(c1, 'modules', `${casings.camel}Module,`);
      return appendRouteToChain(c2, `${casings.camel}Module`);
    },
    onFallback: (msg) => fallbacks.push(msg),
    snippet: () =>
      [
        `// In ${join(project.srcDir, 'app.ts')}:`,
        `import { ${casings.camel}Module } from './modules/${casings.kebab}/index';`,
        `// Add to the modules array:`,
        `${casings.camel}Module,`,
        `// And in the routes callback chain:`,
        `.route(${casings.camel}Module.prefix, ${casings.camel}Module.routes)`,
      ].join('\n'),
  });

  // 3. Optional: modules registry script (powers `pnpm graph` and katajs-devtools).
  // Prefer scripts/modules.ts (the new convention); fall back to scripts/graph.ts
  // for projects that haven't run `katajs upgrade` yet.
  const modulesScript = join(project.root, 'scripts', 'modules.ts');
  const graphScript = join(project.root, 'scripts', 'graph.ts');
  const registryFile = existsSync(modulesScript)
    ? modulesScript
    : existsSync(graphScript)
      ? graphScript
      : null;
  if (registryFile) {
    applyMutation({
      file: registryFile,
      fn: (content) => {
        const c1 = insertBeforeAnchor(
          content,
          'graph-imports',
          `import { ${casings.camel}Module } from '../src/modules/${casings.kebab}/index';`,
        );
        return insertBeforeAnchor(c1, 'graph-modules', `${casings.camel}Module,`);
      },
      onFallback: (msg) => fallbacks.push(msg),
      snippet: () =>
        [
          `// In ${registryFile}:`,
          `import { ${casings.camel}Module } from '../src/modules/${casings.kebab}/index';`,
          `// Add to the modules array:`,
          `${casings.camel}Module,`,
        ].join('\n'),
    });
  }

  // 4. Report.
  p.outro(`${green('✓')} Created module ${cyan(casings.kebab)}`);
  // eslint-disable-next-line no-console
  console.log(dim('  Files:'));
  for (const f of [
    'index.ts',
    `${casings.kebab}.service.ts`,
    `${casings.kebab}.routes.ts`,
    `${casings.kebab}.schema.ts`,
    `${casings.kebab}.errors.ts`,
  ]) {
    // eslint-disable-next-line no-console
    console.log(dim(`    src/modules/${casings.kebab}/${f}`));
  }
  if (fallbacks.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n' + yellow('  Some files couldn’t be auto-edited.'));
    // eslint-disable-next-line no-console
    console.log(yellow('  Paste these snippets manually:\n'));
    for (const f of fallbacks) {
      // eslint-disable-next-line no-console
      console.log(f + '\n');
    }
  }
}

function generateModuleFiles(moduleDir: string, casings: Casings): void {
  mkdirSync(moduleDir, { recursive: true });
  const templatesDir = getTemplatesDir();

  const files: Array<[srcName: string, dstName: string]> = [
    ['index.ts', 'index.ts'],
    ['service.ts', `${casings.kebab}.service.ts`],
    ['routes.ts', `${casings.kebab}.routes.ts`],
    ['schema.ts', `${casings.kebab}.schema.ts`],
    ['errors.ts', `${casings.kebab}.errors.ts`],
  ];

  for (const [srcName, dstName] of files) {
    const srcPath = join(templatesDir, 'module', srcName);
    if (!existsSync(srcPath)) {
      throw new Error(`Template file missing: ${srcPath}`);
    }
    const content = readFileSync(srcPath, 'utf8');
    const replaced = applyCasings(content, casings);
    writeFileSync(join(moduleDir, dstName), replaced);
  }
}

function applyCasings(content: string, casings: Casings): string {
  return content
    .replace(/\{\{kebab\}\}/g, casings.kebab)
    .replace(/\{\{Pascal\}\}/g, casings.pascal)
    .replace(/\{\{camel\}\}/g, casings.camel)
    .replace(/\{\{snake\}\}/g, casings.kebab.replace(/-/g, '_'));
}

type MutationStep = {
  file: string;
  fn: (content: string) => string;
  onFallback: (msg: string) => void;
  snippet: () => string;
};

function applyMutation(step: MutationStep): void {
  if (!existsSync(step.file)) {
    step.onFallback(red(`Skipped ${step.file} (not found)\n${step.snippet()}`));
    return;
  }
  const before = readFileSync(step.file, 'utf8');
  try {
    const after = step.fn(before);
    if (after !== before) {
      writeFileSync(step.file, after);
    }
  } catch (err) {
    if (err instanceof AnchorMissingError) {
      step.onFallback(
        yellow(`Anchor "${err.anchor}" missing in ${step.file}.\n${step.snippet()}`),
      );
    } else {
      throw err;
    }
  }
}

function getTemplatesDir(): string {
  // When bundled by tsup, import.meta.url points to dist/index.js, and
  // templates live alongside under dist/templates/. In dev (tsx), templates
  // are at packages/katajs-cli/src/templates/.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'templates'),
    join(here, '..', 'src', 'templates'),
    join(here, '..', '..', 'src', 'templates'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      // sanity check: must contain `module/` subdir
      try {
        const sub = readdirSync(c);
        if (sub.includes('module')) return c;
      } catch {
        // skip
      }
    }
  }
  throw new Error(
    `Could not locate templates directory. Tried: ${candidates.join(', ')}`,
  );
}

// Re-export for tests.
export { resolve as __resolve };
