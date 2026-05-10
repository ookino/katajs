import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { register } from 'tsx/esm/api';
import { inspectModules, type Inspection, type Module } from '@katajs/core';

let tsxRegistered = false;

function ensureTsx(): void {
  if (tsxRegistered) return;
  register();
  tsxRegistered = true;
}

export type LoaderOptions = {
  /** Project root. Defaults to `process.cwd()`. */
  cwd?: string;
  /**
   * Path (relative to cwd) to the file that exports the `modules` tuple.
   * Defaults to `scripts/modules.ts`, then falls back to `scripts/graph.ts`
   * for backwards compatibility with pre-Shape-B projects.
   */
  modulesFile?: string;
};

export type LoadResult = {
  inspection: Inspection;
  resolvedPath: string;
  /** Absolute file path (no `file://` prefix), suitable for chokidar watching. */
  resolvedAbsolutePath: string;
};

/**
 * Resolves the user's modules tuple file path. Prefers `scripts/modules.ts`
 * (the new convention), falls back to `scripts/graph.ts` if the former is
 * missing (the file must `export const modules = [...]` to be importable).
 */
export function resolveModulesFile(options: LoaderOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  if (options.modulesFile) {
    const abs = resolve(cwd, options.modulesFile);
    if (!existsSync(abs)) {
      throw new Error(
        `katajs-devtools: modules file not found at ${options.modulesFile} (resolved: ${abs})`,
      );
    }
    return abs;
  }
  const preferred = resolve(cwd, 'scripts/modules.ts');
  if (existsSync(preferred)) return preferred;
  const legacy = resolve(cwd, 'scripts/graph.ts');
  if (existsSync(legacy)) return legacy;
  throw new Error(
    `katajs-devtools: no modules file found. Looked for:\n` +
      `  - scripts/modules.ts (preferred)\n` +
      `  - scripts/graph.ts (legacy)\n` +
      `Either of these must export \`const modules = [...]\` for devtools to load.\n` +
      `Run \`katajs upgrade\` to migrate, or pass --modules-file <path> manually.`,
  );
}

/**
 * Loads the user's modules tuple via tsx's ESM register API and returns the
 * `Inspection` object from `inspectModules()`. Cache-busts on every call by
 * appending a timestamp query — supports hot-reload after file changes.
 *
 * If the file also exports `producers` (a `Record<string, { binding: string }>`,
 * matching the shape passed to `createApp({ queues })`), they're forwarded to
 * the inspection so devtools can render producer/consumer pairs.
 */
export async function loadInspection(options: LoaderOptions = {}): Promise<LoadResult> {
  ensureTsx();
  const resolvedAbsolutePath = resolveModulesFile(options);
  const url = `${pathToFileURL(resolvedAbsolutePath).href}?t=${Date.now()}`;
  const mod = (await import(url)) as {
    modules?: readonly Module[];
    producers?: Record<string, { binding: string }>;
  };
  if (!Array.isArray(mod.modules)) {
    throw new Error(
      `katajs-devtools: ${resolvedAbsolutePath} does not export a \`modules\` array.\n` +
        `Expected:\n  export const modules = [postsModule, /* ... */];`,
    );
  }
  const inspection = inspectModules(mod.modules, { producers: mod.producers });
  return { inspection, resolvedPath: url, resolvedAbsolutePath };
}
