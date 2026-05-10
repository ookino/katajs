import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectModules } from '@katajs/core';

import { modules } from './modules';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(here, '..', 'graph.html');

const insp = inspectModules(modules);
writeFileSync(out, insp.html({ title: 'showcase — module graph' }));

// eslint-disable-next-line no-console
console.log(`✓ wrote ${out}`);
// eslint-disable-next-line no-console
console.log(
  `  ${insp.modules.length} modules • ${insp.edges.length} dependencies • ${insp.routes.length} routes`,
);
