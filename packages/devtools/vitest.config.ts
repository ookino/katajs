import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest config is separate from vite.config.ts because the latter sets
// `root: src/ui` for the UI bundle; tests live alongside src/ at the
// package root and shouldn't inherit that root.
export default defineConfig({
  root: resolve(__dirname),
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
  },
});
