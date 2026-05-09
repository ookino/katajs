import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectModules } from '@katajs/core';

import { eventsModule } from '../src/modules/events/index';
import { auditModule } from '../src/modules/audit/index';
import { usersModule } from '../src/modules/users/index';
import { postsModule } from '../src/modules/posts/index';
import { commentsModule } from '../src/modules/comments/index';
// katajs:graph-imports

const modules = [
  eventsModule,
  auditModule,
  usersModule,
  postsModule,
  commentsModule,
  // katajs:graph-modules
];

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
