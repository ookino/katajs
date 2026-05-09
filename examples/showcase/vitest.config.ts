import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const here = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Mirrors tsconfig's `paths` mapping for vitest's runtime resolver. Without
 * this, vitest resolves `@katajs/core` to the built `packages/core/dist/`,
 * which means every framework change requires `pnpm -r build` before tests
 * see it. With this alias, tests run against source — instant feedback.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@katajs/core': here('../../packages/core/src/index.ts'),
      '@katajs/drizzle': here('../../packages/drizzle/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
