import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import mdx from 'fumadocs-mdx/vite';
import * as collections from './source.config';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    // Resolve `@/*` and `collections/*` aliases from tsconfig.json. The
    // monorepo has scaffolder template tsconfigs (with `extends: '@katajs/...'`
    // pointing at unbuilt packages) that the plugin can't parse — we only
    // care about apps/docs's own paths, so silence those warnings.
    tsconfigPaths({ projects: ['./tsconfig.json'], ignoreConfigErrors: true }),
    // Cloudflare Workers (official partner) plugin must come before
    // tanstackStart so the SSR environment is configured correctly.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    mdx(collections),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
  // Several transitive deps in the fumadocs / unified / remark / rehype tree
  // ship CJS with `module.exports = ...`. Vite's dev server hands those raw
  // CJS files to the client and they error with
  // "does not provide an export named 'default'". Pre-bundling the fumadocs
  // entry points makes Vite walk their full dep graph and emit ESM shims.
  // `debug` and `extend` are listed explicitly because they're root-level
  // CJS modules that other deps re-export.
  optimizeDeps: {
    // Force Vite to scan every route + lib file for transitive imports so
    // CJS deps in the unified/remark/rehype tree get pre-bundled before any
    // request hits the dev server. Without this, pnpm's strict isolation
    // hides deep CJS deps until the first runtime import — which then 500s.
    entries: ['src/**/*.{ts,tsx}', 'index.html'],
    include: [
      'fumadocs-core/source',
      'fumadocs-core/search/server',
      'fumadocs-ui/mdx',
      'fumadocs-ui/provider/tanstack',
      'fumadocs-ui/layouts/docs',
      'fumadocs-ui/layouts/docs/page',
      'fumadocs-ui/layouts/home',
      'debug',
      'extend',
      'style-to-js',
      'style-to-object',
    ],
  },
});
