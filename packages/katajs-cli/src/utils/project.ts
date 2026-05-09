import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type KatajsProject = {
  /** Absolute path to the project root (the directory containing package.json). */
  root: string;
  /** Absolute path to the project's `src/` directory. */
  srcDir: string;
  /** Parsed package.json contents. */
  pkg: Record<string, unknown>;
};

/**
 * Walk upward from `cwd` looking for a package.json that declares
 * `@katajs/core` as a dep, devDep, or peerDep. Throws if none is found.
 *
 * Returning the closest match means commands work the same whether you run
 * them from the project root or from a subdir like `src/modules/foo/`.
 */
export function findKatajsProject(cwd: string = process.cwd()): KatajsProject {
  let dir = resolve(cwd);
  while (true) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      if (declaresKatajs(pkg)) {
        const srcDir = join(dir, 'src');
        if (!existsSync(srcDir)) {
          throw new Error(
            `Found @katajs/core in ${pkgPath}, but no src/ directory. Run from a katajs project root.`,
          );
        }
        return { root: dir, srcDir, pkg };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Not in a katajs project — couldn't find a package.json with @katajs/core in this directory or any parent.\nRun this command from inside a project created with \`pnpm create katajs\`.`,
      );
    }
    dir = parent;
  }
}

function declaresKatajs(pkg: Record<string, unknown>): boolean {
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[key];
    if (deps && typeof deps === 'object' && '@katajs/core' in deps) {
      return true;
    }
  }
  return false;
}
