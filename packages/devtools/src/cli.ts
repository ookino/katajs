import { exec } from 'node:child_process';
import { resolve } from 'node:path';
import { cac } from 'cac';
import { bold, cyan, dim, green, red, yellow } from 'kolorist';
import { startServer } from './server.js';

type Options = {
  port?: number;
  host?: string;
  open?: boolean;
  modulesFile?: string;
  cwd?: string;
};

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      // Best-effort. Surface as a hint, not a failure.
      process.stderr.write(dim(`(could not auto-open browser: ${err.message})\n`));
    }
  });
}

async function findFreePort(start: number, host: string): Promise<number> {
  const { createServer } = await import('node:net');
  for (let port = start; port < start + 20; port++) {
    const free = await new Promise<boolean>((res) => {
      const probe = createServer();
      probe.once('error', () => {
        probe.close();
        res(false);
      });
      probe.once('listening', () => {
        probe.close(() => res(true));
      });
      probe.listen(port, host);
    });
    if (free) return port;
  }
  throw new Error(`No free port found in range ${start}-${start + 19}.`);
}

async function run(options: Options): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 4242;
  const port = await findFreePort(requestedPort, host);

  process.stdout.write(`\n  ${bold(cyan('katajs-devtools'))}  ${dim('— interactive module graph')}\n\n`);
  process.stdout.write(`  ${dim('cwd:')}    ${cwd}\n`);
  process.stdout.write(
    `  ${dim('source:')} ${options.modulesFile ?? dim('(auto-detect: scripts/modules.ts → scripts/graph.ts)')}\n\n`,
  );

  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    server = await startServer({
      cwd,
      modulesFile: options.modulesFile,
      port,
      host,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ${red('✗')} failed to start: ${msg}\n\n`);
    process.exit(1);
  }

  if (port !== requestedPort) {
    process.stdout.write(
      `  ${yellow('!')} port ${requestedPort} was busy, using ${port} instead\n`,
    );
  }
  process.stdout.write(`  ${green('➜')} ${bold('Local:')}   ${cyan(server.url)}\n`);
  process.stdout.write(`  ${dim('Press Ctrl+C to stop.')}\n\n`);

  if (options.open !== false) {
    openBrowser(server.url);
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\n${dim(`received ${signal}, shutting down...`)}\n`);
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const cli = cac('katajs-devtools');

cli
  .command('[cwd]', 'Start the interactive devtools server')
  .option('--port <port>', 'Port to listen on', { default: 4242 })
  .option('--host <host>', 'Host to bind', { default: '127.0.0.1' })
  .option('--no-open', 'Do not auto-open the browser')
  .option('--modules-file <path>', 'Override the modules file location')
  .action((cwdArg: string | undefined, opts: Record<string, unknown>) => {
    void run({
      cwd: cwdArg,
      port: typeof opts.port === 'number' ? opts.port : Number(opts.port),
      host: typeof opts.host === 'string' ? opts.host : undefined,
      open: opts.open !== false,
      modulesFile: typeof opts.modulesFile === 'string' ? opts.modulesFile : undefined,
    });
  });

cli.help();
cli.version('0.1.0');
cli.parse();
