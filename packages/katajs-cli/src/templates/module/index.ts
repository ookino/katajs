import { defineModule } from '@katajs/core';
import { make{{Pascal}}Service, type {{Pascal}}Service } from './{{kebab}}.service';
// katajs:module-service-imports
import { {{camel}}Routes } from './{{kebab}}.routes';

export const {{camel}}Module = defineModule({
  name: '{{kebab}}',
  provides: {
    {{camel}}Service: (c): {{Pascal}}Service => make{{Pascal}}Service(c),
    // katajs:module-provides
  },
  requires: [] as const,
  routes: {{camel}}Routes,
  prefix: '/{{kebab}}',
  // katajs:module-consumer
});

/** Services this module contributes to the container's `Registry`. */
export type {{Pascal}}Registry = {
  {{camel}}Service: {{Pascal}}Service;
  // katajs:module-registry
};

export type { {{Pascal}}Service };
