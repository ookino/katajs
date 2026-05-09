/**
 * Detect the package manager that invoked `npm/pnpm/bun create katajs`.
 * Returns 'pnpm' | 'npm' | 'bun' or undefined if undetectable.
 */
export function detectPackageManager(): 'pnpm' | 'npm' | 'bun' | undefined {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return undefined;
  if (ua.startsWith('pnpm/')) return 'pnpm';
  if (ua.startsWith('bun/')) return 'bun';
  if (ua.startsWith('npm/')) return 'npm';
  return undefined;
}
