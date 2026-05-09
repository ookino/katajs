import type { RequestContainer } from '@katajs/core';

export type {{Pascal}}Service = {
  ping(): Promise<{ ok: true; module: string }>;
};

export function make{{Pascal}}Service(_c: RequestContainer): {{Pascal}}Service {
  return {
    async ping() {
      return { ok: true as const, module: '{{kebab}}' };
    },
  };
}
