import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { cyan, dim, green, yellow } from 'kolorist';
import { AnchorMissingError, insertBeforeAnchor } from '../codemod';
import { findKatajsProject } from '../utils/project';
import { normalizeName, type Casings } from '../utils/text';

export type AddServiceOptions = {
  /** Service name in any reasonable form. */
  name: string;
  /** The module to add this service into (kebab name). */
  inModule: string;
  cwd?: string;
};

export async function addService(opts: AddServiceOptions): Promise<void> {
  const project = findKatajsProject(opts.cwd);
  const moduleCasings = normalizeName(opts.inModule);
  const serviceCasings = normalizeName(opts.name);

  const moduleDir = join(project.srcDir, 'modules', moduleCasings.kebab);
  if (!existsSync(moduleDir)) {
    throw new Error(
      `Module "${moduleCasings.kebab}" not found at ${moduleDir}. Run \`katajs add module ${moduleCasings.kebab}\` first.`,
    );
  }

  const servicePath = join(moduleDir, `${serviceCasings.kebab}.service.ts`);
  if (existsSync(servicePath)) {
    throw new Error(
      `Service file already exists: ${servicePath}\nRefusing to overwrite.`,
    );
  }

  // 1. Generate the service file from the module-template's service.ts.
  writeServiceFile(servicePath, serviceCasings);

  // 2. Mutate the module's index.ts.
  const indexPath = join(moduleDir, 'index.ts');
  const fallbacks: string[] = [];

  if (!existsSync(indexPath)) {
    fallbacks.push(
      yellow(`Module index not found: ${indexPath}\nWire up the new service manually.`),
    );
  } else {
    let content = readFileSync(indexPath, 'utf8');
    let snippet = '';
    try {
      content = insertBeforeAnchor(
        content,
        'module-service-imports',
        `import { make${serviceCasings.pascal}Service, type ${serviceCasings.pascal}Service } from './${serviceCasings.kebab}.service';`,
      );
    } catch (err) {
      if (err instanceof AnchorMissingError) {
        snippet += `import { make${serviceCasings.pascal}Service, type ${serviceCasings.pascal}Service } from './${serviceCasings.kebab}.service';\n`;
      } else throw err;
    }
    try {
      content = insertBeforeAnchor(
        content,
        'module-provides',
        `${serviceCasings.camel}Service: (c): ${serviceCasings.pascal}Service => make${serviceCasings.pascal}Service(c),`,
      );
    } catch (err) {
      if (err instanceof AnchorMissingError) {
        snippet += `// Add to provides:\n${serviceCasings.camel}Service: (c): ${serviceCasings.pascal}Service => make${serviceCasings.pascal}Service(c),\n`;
      } else throw err;
    }
    try {
      content = insertBeforeAnchor(
        content,
        'module-registry',
        `${serviceCasings.camel}Service: ${serviceCasings.pascal}Service;`,
      );
    } catch (err) {
      if (err instanceof AnchorMissingError) {
        snippet += `// Add to ${moduleCasings.pascal}Registry:\n${serviceCasings.camel}Service: ${serviceCasings.pascal}Service;\n`;
      } else throw err;
    }

    writeFileSync(indexPath, content);

    if (snippet) {
      fallbacks.push(
        yellow(`Some anchors missing in ${indexPath}.\nPaste manually:\n`) + snippet,
      );
    }
  }

  // 3. Report.
  p.outro(
    `${green('✓')} Created service ${cyan(serviceCasings.camel + 'Service')} in module ${cyan(moduleCasings.kebab)}`,
  );
  // eslint-disable-next-line no-console
  console.log(dim('  File:'));
  // eslint-disable-next-line no-console
  console.log(
    dim(`    src/modules/${moduleCasings.kebab}/${serviceCasings.kebab}.service.ts`),
  );

  if (fallbacks.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n' + yellow('  Some snippets need manual paste:\n'));
    for (const f of fallbacks) {
      // eslint-disable-next-line no-console
      console.log(f + '\n');
    }
  }
}

function writeServiceFile(dst: string, casings: Casings): void {
  const tmpl = `import type { RequestContainer } from '@katajs/core';

export type ${casings.pascal}Service = {
  ping(): Promise<{ ok: true; service: string }>;
};

export function make${casings.pascal}Service(_c: RequestContainer): ${casings.pascal}Service {
  return {
    async ping() {
      return { ok: true as const, service: '${casings.kebab}' };
    },
  };
}
`;
  writeFileSync(dst, tmpl);
}

// Helper kept for parity with add-module (templates dir lookup).
export const __dirname = dirname(fileURLToPath(import.meta.url));
