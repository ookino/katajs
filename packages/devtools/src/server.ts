import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { loadInspection, type LoadResult } from './loader.js';

export type ServerOptions = {
  cwd: string;
  modulesFile?: string;
  port: number;
  host: string;
};

type SseClient = {
  res: ServerResponse;
  id: number;
};

const here = fileURLToPath(new URL('.', import.meta.url));
const uiStaticDir = resolve(here, 'ui');

function mimeFor(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

function send(res: ServerResponse, status: number, body: string | Buffer, contentType: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function jsonOf(insp: LoadResult['inspection']): string {
  return JSON.stringify(
    {
      modules: insp.modules,
      edges: insp.edges,
      routes: insp.routes,
    },
    null,
    2,
  );
}

export async function startServer(options: ServerOptions): Promise<{
  url: string;
  close(): Promise<void>;
}> {
  let lastResult = null as LoadResult | null;
  let lastError = null as Error | null;
  const sseClients = new Set<SseClient>();
  let nextSseId = 1;

  async function refresh(): Promise<void> {
    try {
      lastResult = await loadInspection({ cwd: options.cwd, modulesFile: options.modulesFile });
      lastError = null;
      const payload = jsonOf(lastResult.inspection);
      for (const c of sseClients) {
        c.res.write(`event: graph\ndata: ${payload}\n\n`);
      }
    } catch (err) {
      lastResult = null;
      lastError = err instanceof Error ? err : new Error(String(err));
      const payload = JSON.stringify({ message: lastError.message });
      for (const c of sseClients) {
        c.res.write(`event: error\ndata: ${payload}\n\n`);
      }
    }
  }

  await refresh();

  const watchPaths: string[] = [];
  if (lastResult) watchPaths.push(lastResult.resolvedAbsolutePath);
  const srcModulesDir = resolve(options.cwd, 'src/modules');
  if (existsSync(srcModulesDir)) watchPaths.push(srcModulesDir);

  let watcher: FSWatcher | null = null;
  if (watchPaths.length > 0) {
    watcher = chokidarWatch(watchPaths, {
      ignoreInitial: true,
      ignored: (p: string) => p.includes('/node_modules/') || p.includes('/dist/'),
    });
    let pending: NodeJS.Timeout | null = null;
    const debounced = (): void => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        void refresh();
      }, 50);
    };
    watcher.on('add', debounced);
    watcher.on('change', debounced);
    watcher.on('unlink', debounced);
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/graph.json') {
      if (lastError) {
        send(res, 500, JSON.stringify({ error: lastError.message }, null, 2), 'application/json; charset=utf-8');
        return;
      }
      if (!lastResult) {
        send(res, 503, JSON.stringify({ error: 'graph not loaded yet' }), 'application/json; charset=utf-8');
        return;
      }
      send(res, 200, jsonOf(lastResult.inspection), 'application/json; charset=utf-8');
      return;
    }

    if (pathname === '/api/graph.sse') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      const id = nextSseId++;
      const client: SseClient = { res, id };
      sseClients.add(client);
      res.write(`: connected\n\n`);
      if (lastResult) {
        res.write(`event: graph\ndata: ${jsonOf(lastResult.inspection)}\n\n`);
      } else if (lastError) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: lastError.message })}\n\n`);
      }
      const keepalive = setInterval(() => res.write(`: ping\n\n`), 15000);
      req.on('close', () => {
        clearInterval(keepalive);
        sseClients.delete(client);
      });
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      const indexPath = join(uiStaticDir, 'index.html');
      if (existsSync(indexPath)) {
        const buf = await readFile(indexPath);
        send(res, 200, buf, 'text/html; charset=utf-8');
        return;
      }
      send(
        res,
        404,
        'UI bundle not found — did you run `pnpm --filter @katajs/devtools build`?',
        'text/plain; charset=utf-8',
      );
      return;
    }

    // Serve any other path as a static file under the UI dir (Vite emits
    // /assets/index-XYZ.js etc.).
    const safe = normalize(pathname).replace(/^([./\\])+/, '');
    const filePath = join(uiStaticDir, safe);
    if (filePath.startsWith(uiStaticDir) && existsSync(filePath)) {
      const buf = await readFile(filePath);
      send(res, 200, buf, mimeFor(filePath));
      return;
    }
    send(res, 404, 'not found', 'text/plain; charset=utf-8');
  };

  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      send(res, 500, msg, 'text/plain; charset=utf-8');
    });
  });

  await new Promise<void>((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolveStart();
    });
  });

  const url = `http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${options.port}`;

  return {
    url,
    async close(): Promise<void> {
      for (const c of sseClients) c.res.end();
      sseClients.clear();
      if (watcher) await watcher.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
