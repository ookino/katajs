import { defineConfig } from 'tsup';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: false,
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  shims: false,
  async onSuccess() {
    // Templates ship next to the bundled CLI so the runtime can find them.
    const src = resolve('src/templates');
    const dst = resolve('dist/templates');
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    if (existsSync(src)) cpSync(src, dst, { recursive: true });
  },
});
