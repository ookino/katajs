import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { cyan, dim, green, yellow } from 'kolorist';
import { AnchorMissingError, insertBeforeAnchor } from '../codemod';
import { findKatajsProject } from '../utils/project';
import { normalizeName } from '../utils/text';

const VALID_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

export type AddRouteOptions = {
  /** HTTP method (case-insensitive). */
  method: string;
  /** Path pattern (must start with /). */
  path: string;
  /** Target module (kebab name). */
  inModule: string;
  cwd?: string;
};

export async function addRoute(opts: AddRouteOptions): Promise<void> {
  const project = findKatajsProject(opts.cwd);
  const method = opts.method.toLowerCase();
  if (!VALID_METHODS.has(method)) {
    throw new Error(
      `Invalid HTTP method: "${opts.method}". Supported: ${[...VALID_METHODS].join(', ')}.`,
    );
  }
  if (!opts.path.startsWith('/')) {
    throw new Error(`Path must start with "/": got "${opts.path}".`);
  }

  const moduleCasings = normalizeName(opts.inModule);
  const moduleDir = join(project.srcDir, 'modules', moduleCasings.kebab);
  const routesPath = join(moduleDir, `${moduleCasings.kebab}.routes.ts`);
  if (!existsSync(routesPath)) {
    throw new Error(
      `Routes file not found: ${routesPath}\nIs "${moduleCasings.kebab}" a routed module? Service-only modules don't have routes.`,
    );
  }

  const content = readFileSync(routesPath, 'utf8');
  const snippet = buildRouteSnippet(method, opts.path);

  let updated: string;
  try {
    updated = insertBeforeAnchor(content, 'module-routes', snippet.split('\n'));
  } catch (err) {
    if (err instanceof AnchorMissingError) {
      p.outro(
        yellow(
          `Anchor "// katajs:module-routes" missing in ${routesPath}.\nPaste this snippet into the chain manually:\n\n${snippet}`,
        ),
      );
      return;
    }
    throw err;
  }

  if (updated === content) {
    p.outro(yellow(`No change — ${method.toUpperCase()} ${opts.path} appears to already exist.`));
    return;
  }

  writeFileSync(routesPath, updated);

  p.outro(
    `${green('✓')} Added ${cyan(method.toUpperCase() + ' ' + opts.path)} to module ${cyan(moduleCasings.kebab)}`,
  );
  // eslint-disable-next-line no-console
  console.log(dim(`  Edited src/modules/${moduleCasings.kebab}/${moduleCasings.kebab}.routes.ts`));
}

function buildRouteSnippet(method: string, path: string): string {
  return [
    `.${method}('${path}', async (c) => {`,
    `  // TODO: implement ${method.toUpperCase()} ${path}`,
    `  return c.json({});`,
    `})`,
  ].join('\n');
}
