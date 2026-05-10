import { defineConfig } from 'tsup';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: false,
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  external: ['@katajs/core', 'tsx'],
  shims: false,
  async onSuccess() {
    const src = resolve('src/ui-static');
    const dst = resolve('dist/ui-static');
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    if (existsSync(src)) cpSync(src, dst, { recursive: true });
  },
});
