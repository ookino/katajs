import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadInspection, resolveModulesFile } from '../src/loader';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (name: string): string => resolve(here, 'fixtures', name);

describe('resolveModulesFile', () => {
  it('prefers scripts/modules.ts when present', () => {
    const path = resolveModulesFile({ cwd: fixture('with-modules-ts') });
    expect(path.endsWith('scripts/modules.ts')).toBe(true);
  });

  it('falls back to scripts/graph.ts when modules.ts is missing', () => {
    const path = resolveModulesFile({ cwd: fixture('with-graph-ts') });
    expect(path.endsWith('scripts/graph.ts')).toBe(true);
  });

  it('throws a helpful error when neither file exists', () => {
    expect(() => resolveModulesFile({ cwd: fixture('empty') })).toThrow(
      /no modules file found/i,
    );
  });

  it('honours an explicit modulesFile override', () => {
    const path = resolveModulesFile({
      cwd: fixture('with-modules-ts'),
      modulesFile: 'scripts/modules.ts',
    });
    expect(path.endsWith('scripts/modules.ts')).toBe(true);
  });

  it('rejects an explicit modulesFile that does not exist', () => {
    expect(() =>
      resolveModulesFile({ cwd: fixture('with-modules-ts'), modulesFile: 'does/not/exist.ts' }),
    ).toThrow(/modules file not found/i);
  });
});

describe('loadInspection', () => {
  it('imports modules.ts and returns an Inspection', async () => {
    const { inspection, resolvedAbsolutePath } = await loadInspection({
      cwd: fixture('with-modules-ts'),
    });
    expect(inspection.modules).toHaveLength(1);
    expect(inspection.modules[0]).toMatchObject({
      name: 'posts',
      prefix: '/posts',
      hasRoutes: true,
    });
    expect(inspection.routes.some((r) => r.path === '/posts')).toBe(true);
    expect(resolvedAbsolutePath.endsWith('scripts/modules.ts')).toBe(true);
  });

  it('falls back to scripts/graph.ts when modules.ts is missing', async () => {
    const { inspection, resolvedAbsolutePath } = await loadInspection({
      cwd: fixture('with-graph-ts'),
    });
    expect(inspection.modules.map((m) => m.name)).toEqual(['users']);
    expect(resolvedAbsolutePath.endsWith('scripts/graph.ts')).toBe(true);
  });

  it('throws if the modules file does not export `modules`', async () => {
    await expect(loadInspection({ cwd: fixture('no-export') })).rejects.toThrow(
      /does not export.*modules.*array/i,
    );
  });
});
