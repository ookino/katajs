import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { cyan, dim, green, red, yellow } from 'kolorist';
import { AnchorMissingError, hasAnchor, insertBeforeAnchor } from '../codemod';
import { findKatajsProject } from '../utils/project';
import { normalizeName, type Casings } from '../utils/text';

export type AddDatabaseOptions = {
  /** Database name in any reasonable form: kebab, camel, snake. */
  name: string;
  /** Optional working directory; defaults to process.cwd(). */
  cwd?: string;
  /** Skip the `c.db` → `c.db.main` rewrite across modules (default: do it). */
  noRewrite?: boolean;
};

/**
 * Add a second (or third, …) database to a katajs project.
 *
 * - First call converts `createApp({ db: adapter })` into a named map
 *   (`db: { main: adapter, <name>: ... }`), rewrites the `AppDb` augmentation
 *   to the map shape, and rewrites `c.db` → `c.db.main` (and friends) across
 *   `src/modules/**` + `src/app.ts`. Anchors (`// katajs:databases`,
 *   `// katajs:databases-registry`) are planted so subsequent calls just
 *   append.
 * - Subsequent calls insert a new entry at those anchors — no rewrite needed.
 *
 * Each step is best-effort: an anchor-miss or an un-matched line reports a
 * snippet to paste manually instead of failing the whole command.
 */
export async function addDatabase(opts: AddDatabaseOptions): Promise<void> {
  const project = findKatajsProject(opts.cwd);
  const casings = normalizeName(opts.name);
  const envName = casings.kebab.replace(/-/g, '_').toUpperCase() + '_HD';

  if (casings.camel === 'main') {
    throw new Error(
      "'main' is reserved for the primary database. Pick a different name (e.g. 'sessions', 'analytics').",
    );
  }

  const appPath = join(project.srcDir, 'app.ts');
  const typesPath = join(project.srcDir, 'types.d.ts');
  const schemaPath = join(project.srcDir, 'db', `${casings.kebab}-schema.ts`);

  if (existsSync(schemaPath)) {
    throw new Error(
      `Schema file already exists: ${schemaPath}\nRefusing to overwrite. Delete it or pick a different name.`,
    );
  }

  const appBefore = existsSync(appPath) ? readFileSync(appPath, 'utf8') : '';
  // "Already a map" when the `db:` value opens with `{` directly.
  const alreadyMulti = /\bdb:\s*\{/m.test(appBefore);

  // 1. Scaffold the schema stub.
  mkdirSync(dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, applyCasings(readSchemaTemplate(), casings));

  const fallbacks: string[] = [];

  // 2. app.ts mutations.
  applyMutation({
    file: appPath,
    fn: (content) => {
      let out = content;
      // schema import
      out = insertAfterLine(
        out,
        /^import \* as schema from ['"]\.\/db\/schema['"];?\s*$/m,
        `import * as ${casings.camel}Schema from './db/${casings.kebab}-schema';`,
        () => {
          fallbacks.push(
            yellow(
              `Couldn't find \`import * as schema from './db/schema';\` in app.ts.\n` +
                `Add manually:\n  import * as ${casings.camel}Schema from './db/${casings.kebab}-schema';`,
            ),
          );
        },
      );
      // Bindings type: add the new Hyperdrive binding
      out = insertAfterLine(
        out,
        /^(\s*)HYPERDRIVE: Hyperdrive;\s*$/m,
        `${envName}: Hyperdrive;`,
        () => {
          fallbacks.push(
            yellow(
              `Couldn't find \`HYPERDRIVE: Hyperdrive;\` in the Bindings type.\n` +
                `Add manually:\n  ${envName}: Hyperdrive;`,
            ),
          );
        },
        /* matchIndentOf */ true,
      );
      // db config
      const newEntry = `${casings.camel}: drizzleAdapter({ schema: ${casings.camel}Schema, bindingName: '${envName}' }),`;
      if (alreadyMulti || hasAnchor(out, 'databases')) {
        out = insertBeforeAnchor(out, 'databases', newEntry);
      } else {
        // Convert `db: drizzleAdapter(...)` (single line) into a map.
        const dbLineRe = /^(\s*)db:\s*(drizzleAdapter\([^\n]*?\)),?\s*$/m;
        const m = out.match(dbLineRe);
        if (m) {
          const indent = m[1] ?? '  ';
          const adapterExpr = m[2]!;
          const inner = indent + '  ';
          const block =
            `${indent}db: {\n` +
            `${inner}main: ${adapterExpr},\n` +
            `${inner}${newEntry}\n` +
            `${inner}// katajs:databases\n` +
            `${indent}},`;
          out = out.replace(dbLineRe, block);
        } else {
          fallbacks.push(
            yellow(
              `Couldn't auto-convert the \`db:\` line in app.ts. Change it to a map:\n` +
                `  db: {\n` +
                `    main: <your existing adapter>,\n` +
                `    ${newEntry}\n` +
                `    // katajs:databases\n` +
                `  },`,
            ),
          );
        }
      }
      return out;
    },
    onFallback: (msg) => fallbacks.push(msg),
  });

  // 3. types.d.ts mutations.
  applyMutation({
    file: typesPath,
    fn: (content) => {
      let out = content;
      out = insertAfterLine(
        out,
        /^import type \* as schema from ['"]\.\/db\/schema['"];?\s*$/m,
        `import type * as ${casings.camel}Schema from './db/${casings.kebab}-schema';`,
        () => {
          fallbacks.push(
            yellow(
              `Couldn't find \`import type * as schema from './db/schema';\` in types.d.ts.\n` +
                `Add manually:\n  import type * as ${casings.camel}Schema from './db/${casings.kebab}-schema';`,
            ),
          );
        },
      );
      const newMember = `${casings.camel}: DrizzleClient<typeof ${casings.camel}Schema>;`;
      if (alreadyMulti || hasAnchor(out, 'databases-registry')) {
        out = insertBeforeAnchor(out, 'databases-registry', newMember);
      } else {
        // Convert `interface AppDb extends DrizzleClient<typeof schema> {}` to a map.
        const appDbRe =
          /^(\s*)interface AppDb extends DrizzleClient<typeof schema>\s*\{\s*\}\s*$/m;
        const m = out.match(appDbRe);
        if (m) {
          const indent = m[1] ?? '  ';
          const inner = indent + '  ';
          const block =
            `${indent}interface AppDb {\n` +
            `${inner}main: DrizzleClient<typeof schema>;\n` +
            `${inner}${newMember}\n` +
            `${inner}// katajs:databases-registry\n` +
            `${indent}}`;
          out = out.replace(appDbRe, block);
        } else {
          fallbacks.push(
            yellow(
              `Couldn't auto-convert the \`AppDb\` augmentation in types.d.ts. Change it to a map:\n` +
                `  interface AppDb {\n` +
                `    main: DrizzleClient<typeof schema>;\n` +
                `    ${newMember}\n` +
                `    // katajs:databases-registry\n` +
                `  }`,
            ),
          );
        }
      }
      return out;
    },
    onFallback: (msg) => fallbacks.push(msg),
  });

  // 4. On the single → map transition, rewrite c.db references across modules.
  const rewritten: Array<{ file: string; count: number }> = [];
  if (!alreadyMulti && !opts.noRewrite) {
    const targets = [
      ...listTsFiles(join(project.srcDir, 'modules')),
      ...(existsSync(appPath) ? [appPath] : []),
    ];
    for (const file of targets) {
      const before = readFileSync(file, 'utf8');
      const { text, count } = rewriteDbRefs(before);
      if (count > 0) {
        writeFileSync(file, text);
        rewritten.push({ file, count });
      }
    }
  }

  // 5. Report.
  p.outro(`${green('✓')} Added database ${cyan(casings.camel)}`);
  // eslint-disable-next-line no-console
  console.log(dim('  Created:'));
  // eslint-disable-next-line no-console
  console.log(dim(`    src/db/${casings.kebab}-schema.ts`));
  if (rewritten.length > 0) {
    // eslint-disable-next-line no-console
    console.log(dim('\n  Rewrote c.db → c.db.main in:'));
    for (const { file, count } of rewritten) {
      // eslint-disable-next-line no-console
      console.log(dim(`    ${relative(project.root, file)} (${count} change${count === 1 ? '' : 's'})`));
    }
    // eslint-disable-next-line no-console
    console.log(yellow('\n  ⚠  Review those rewrites — the codemod is regex-based and may miss\n     edge cases (e.g. a withTransaction callback param other than `c`).'));
  }
  // eslint-disable-next-line no-console
  console.log('\n' + dim('  Next:'));
  // eslint-disable-next-line no-console
  console.log(dim(`    1. Add the '${envName}' Hyperdrive binding to wrangler.jsonc:`));
  // eslint-disable-next-line no-console
  console.log(
    dim(
      `       { "binding": "${envName}", "id": "<hyperdrive-id>",\n` +
        `         "localConnectionString": "postgres://postgres:postgres@localhost:5432/${casings.kebab}_dev" }`,
    ),
  );
  // eslint-disable-next-line no-console
  console.log(dim(`    2. Define real tables in src/db/${casings.kebab}-schema.ts and wire a`));
  // eslint-disable-next-line no-console
  console.log(dim(`       Drizzle Kit config at it for migrations.`));
  // eslint-disable-next-line no-console
  console.log(dim(`    3. Use it: c.db.${casings.camel}.query.<table>... or c.withTransaction('${casings.camel}', fn).`));

  if (fallbacks.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n' + yellow('  Some edits couldn’t be applied automatically — do these by hand:\n'));
    for (const f of fallbacks) {
      // eslint-disable-next-line no-console
      console.log(f + '\n');
    }
  }
}

/* --------------------------------------------------------------------------
 * The `c.db` rewrite
 * ------------------------------------------------------------------------ */

/**
 * Conservative rewrite for the single → multi transition:
 *   c.db                  → c.db.main
 *   c.db.<x>              → c.db.main.<x>          (skips c.db.main.<x>)
 *   c.var.db              → c.var.db.main
 *   c.var.db.<x>          → c.var.db.main.<x>
 *   c.var.container.db    → c.var.container.db.main
 *   c.var.container.db.<x>→ c.var.container.db.main.<x>
 *   .withTransaction(     → .withTransaction('main',      (skips ('main', / ("...))
 *
 * Word boundaries keep `c.db` from matching `abc.db`, `someDb`, etc. Idempotent.
 */
export function rewriteDbRefs(src: string): { text: string; count: number } {
  let count = 0;
  let out = src;

  for (const base of ['c.db', 'c.var.db', 'c.var.container.db']) {
    const baseEsc = base.replace(/\./g, '\\.');
    // dotted access: <base>.<x>  →  <base>.main.<x>   (skip if <x> is exactly `main`)
    const dotted = new RegExp(`\\b${baseEsc}\\.(?!main\\b)`, 'g');
    out = out.replace(dotted, (m) => {
      count++;
      return m.replace(/\.$/, '.main.');
    });
    // bare: <base> not followed by `.` or a word char  →  <base>.main
    const bare = new RegExp(`\\b${baseEsc}(?![.\\w])`, 'g');
    out = out.replace(bare, (m) => {
      count++;
      return `${m}.main`;
    });
  }

  // .withTransaction( ... )  →  .withTransaction('main', ... )   (idempotent)
  out = out.replace(/\.withTransaction\(\s*(?!['"`])/g, (m) => {
    count++;
    return m.replace(/\($/, "('main', ").replace(/\(\s+$/, "('main', ");
  });

  return { text: out, count };
}

/* --------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------ */

type MutationStep = {
  file: string;
  fn: (content: string) => string;
  onFallback: (msg: string) => void;
};

function applyMutation(step: MutationStep): void {
  if (!existsSync(step.file)) {
    step.onFallback(red(`Skipped ${step.file} (not found).`));
    return;
  }
  const before = readFileSync(step.file, 'utf8');
  try {
    const after = step.fn(before);
    if (after !== before) writeFileSync(step.file, after);
  } catch (err) {
    if (err instanceof AnchorMissingError) {
      step.onFallback(yellow(`Anchor "${err.anchor}" missing in ${step.file}.`));
    } else {
      throw err;
    }
  }
}

/** Insert `line` on its own line directly after the first line matching `re`. */
function insertAfterLine(
  content: string,
  re: RegExp,
  line: string,
  onMiss: () => void,
  matchIndentOf = false,
): string {
  const m = content.match(re);
  if (!m) {
    onMiss();
    return content;
  }
  if (content.includes(line.trim())) return content; // idempotent
  const matched = m[0];
  const indent = matchIndentOf ? (matched.match(/^(\s*)/)?.[1] ?? '') : '';
  return content.replace(matched, `${matched}\n${indent}${line}`);
}

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relative(root: string, file: string): string {
  return file.startsWith(root + '/') ? file.slice(root.length + 1) : file;
}

function applyCasings(content: string, casings: Casings): string {
  return content
    .replace(/\{\{kebab\}\}/g, casings.kebab)
    .replace(/\{\{Pascal\}\}/g, casings.pascal)
    .replace(/\{\{camel\}\}/g, casings.camel)
    .replace(/\{\{snake\}\}/g, casings.kebab.replace(/-/g, '_'));
}

function readSchemaTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'templates', 'database', 'schema.ts'),
    join(here, '..', 'src', 'templates', 'database', 'schema.ts'),
    join(here, '..', '..', 'src', 'templates', 'database', 'schema.ts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, 'utf8');
  }
  throw new Error(
    `Could not locate the database schema template. Tried: ${candidates.join(', ')}`,
  );
}

// Re-exported for tests.
export { rewriteDbRefs as __rewriteDbRefs };
