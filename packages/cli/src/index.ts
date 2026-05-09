import { cac } from 'cac';
import * as p from '@clack/prompts';
import { cyan, dim, green, red, yellow } from 'kolorist';
import { existsSync, readdirSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { runScaffold, type ScaffoldOptions } from './scaffold';
import { detectPackageManager } from './prompts';

const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

type RawFlags = {
  auth?: boolean;
  monorepo?: boolean;
  install?: boolean;
  pm?: string;
  git?: boolean;
};

async function main() {
  const cli = cac('create-katajs');
  cli
    .command('[name]', 'Scaffold a katajs project')
    .option('--auth', 'Include Better Auth (single-API mode only)')
    .option('--monorepo', 'Scaffold as a pnpm + Turbo monorepo (apps/api + packages/db + packages/api-client)')
    .option('--no-install', 'Skip pnpm/npm/bun install')
    .option('--pm <pm>', 'Force package manager (pnpm | npm | bun)')
    .option('--no-git', 'Skip git init + initial commit')
    .action(async (name: string | undefined, flags: RawFlags) => {
      try {
        await run(name, flags);
      } catch (err) {
        p.log.error(red((err as Error).message));
        process.exit(1);
      }
    });
  cli.help();
  cli.version('0.1.0');
  cli.parse();
}

async function run(rawName: string | undefined, flags: RawFlags) {
  p.intro(cyan('create-katajs'));

  const projectName = await resolveProjectName(rawName);
  if (p.isCancel(projectName)) return p.cancel('Aborted.');

  const targetDir = pathResolve(process.cwd(), projectName);
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new Error(`Target directory '${projectName}' is not empty.`);
  }

  const interactive = process.stdin.isTTY === true;

  const monorepo =
    flags.monorepo ?? (interactive ? await askYesNo('Scaffold as a monorepo (apps/api + shared packages)?', false) : false);
  if (p.isCancel(monorepo)) return p.cancel('Aborted.');

  const auth =
    flags.auth ?? (interactive ? await askYesNo('Include Better Auth?', false) : false);
  if (p.isCancel(auth)) return p.cancel('Aborted.');

  if (auth && monorepo) {
    p.log.warn(
      yellow('--auth + --monorepo is not yet supported (Phase 2). Auth scaffolding will be skipped.'),
    );
  }

  const detectedPm = detectPackageManager();
  const pm =
    flags.pm ?? detectedPm ?? (interactive ? await askPm() : 'pnpm');
  if (p.isCancel(pm)) return p.cancel('Aborted.');
  if (pm !== 'pnpm' && pm !== 'npm' && pm !== 'bun') {
    throw new Error(`Unsupported package manager '${pm}'. Use one of: pnpm, npm, bun.`);
  }

  const install = flags.install !== false;
  const initGit = flags.git !== false;

  p.log.step(
    `Scaffolding ${green(projectName)} (` +
      `${monorepo ? 'monorepo' : 'single-api'}, ` +
      `auth=${auth ? 'yes' : 'no'}, pm=${pm}, ` +
      `install=${install ? 'yes' : 'no'}, git=${initGit ? 'yes' : 'no'})`,
  );

  const opts: ScaffoldOptions = {
    targetDir,
    projectName,
    auth: !!auth,
    monorepo: !!monorepo,
    packageManager: pm,
    install,
    initGit,
  };

  await runScaffold(opts);

  p.outro(green(`✓ Created ${projectName} in ./${projectName}`));
  console.log();
  console.log('Next steps:');
  console.log(`  ${cyan('cd')} ${projectName}`);
  if (!install) console.log(`  ${cyan(pm)} install`);
  console.log(`  ${cyan(pm)} dev`);
  console.log();
  console.log(dim('Resources:'));
  console.log(dim('  Docs: https://github.com/<owner>/katajs'));
  console.log(dim('  Hono: https://hono.dev'));
  console.log(dim('  Hyperdrive: https://developers.cloudflare.com/hyperdrive'));
}

async function resolveProjectName(raw: string | undefined): Promise<string | symbol> {
  if (raw) {
    if (!PROJECT_NAME_RE.test(raw)) {
      throw new Error(
        `Invalid project name '${raw}'. Use lowercase letters, digits, and hyphens (must start with a letter or digit).`,
      );
    }
    return raw;
  }
  if (process.stdin.isTTY !== true) {
    throw new Error(
      'Project name is required when running non-interactively. Pass it as the first positional argument.',
    );
  }
  const answer = await p.text({
    message: 'Project name?',
    placeholder: 'my-api',
    validate: (v) => {
      if (!v) return 'Required';
      if (!PROJECT_NAME_RE.test(v)) return 'Use lowercase letters, digits, and hyphens.';
      return undefined;
    },
  });
  return answer;
}

async function askYesNo(message: string, initial: boolean): Promise<boolean | symbol> {
  return p.confirm({ message, initialValue: initial });
}

async function askPm(): Promise<string | symbol> {
  return p.select({
    message: 'Package manager?',
    initialValue: 'pnpm',
    options: [
      { value: 'pnpm', label: 'pnpm' },
      { value: 'npm', label: 'npm' },
      { value: 'bun', label: 'bun' },
    ],
  });
}

void main().catch((err) => {
  console.error(yellow('Unexpected error:'));
  console.error(err);
  process.exit(1);
});
