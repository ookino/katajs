import type { Module, RoutedModule } from './module';

/**
 * Static snapshot of a module's contribution to the app graph. Doesn't
 * carry runtime state — purely shape data extracted from the user's
 * `defineModule(...)` calls.
 */
export type GraphModule = {
  name: string;
  provides: string[];
  requires: string[];
  prefix?: string;
  hasRoutes: boolean;
  /** Present when the module declares `consumer:` — points at a queue binding. */
  consumer?: GraphConsumer;
};

/** Queue consumer attached to a module. */
export type GraphConsumer = {
  /** wrangler binding name for the queue this module consumes. */
  queue: string;
  /** Optional dead-letter binding name. */
  dlq?: string;
};

/**
 * Producer manifest entry from `createApp({ queues })`. Producers are app-level
 * (not module-level) so they're inspected separately from modules.
 */
export type GraphProducer = {
  /** The key under `queues:` (also the wrapper name on `c.var.queues.<name>`). */
  name: string;
  /** wrangler binding name (e.g. 'ORDER_QUEUE'). */
  binding: string;
};

/** Directed dependency edge: `from` requires service `via`, which `to` provides. */
export type GraphEdge = {
  from: string;
  to: string;
  via: string;
};

/** Flattened HTTP route, prefixed with its owning module's mount path. */
export type GraphRoute = {
  method: string;
  path: string;
  module: string;
};

export type Inspection = {
  modules: GraphModule[];
  edges: GraphEdge[];
  routes: GraphRoute[];
  /** App-level producer manifests, optional. Empty array when no producers passed. */
  producers: GraphProducer[];
  /** A `graph TD` Mermaid source string suitable for embedding in markdown or HTML. */
  mermaid(): string;
  /** Pretty-printed JSON for piping to other tooling. */
  json(): string;
  /** Self-contained HTML page that renders the graph + tables in a browser. */
  html(opts?: HtmlOptions): string;
};

export type InspectOptions = {
  /**
   * App-level producer manifests, normally the contents of `createApp({ queues })`.
   * Each entry maps a producer name to its wrangler binding. Pass-through to the
   * Inspection's `producers` array so devtools can render producer/consumer pairs.
   */
  producers?: Record<string, { binding: string }>;
};

export type HtmlOptions = {
  /** Title shown at the top of the page. Default: "katajs — module graph". */
  title?: string;
};

/**
 * Inspect a list of modules and return everything needed to render the app's
 * structure (graph, dependency edges, route table) without booting the app.
 *
 * Pure / synchronous — safe to call at build time. Use the returned `.html()`
 * to write a self-contained snapshot file, or `.mermaid()` to embed in docs.
 *
 * TODO(Shape B): when we build the live devtools server, it will read the
 * same `Inspection` shape from a `__katajs/graph` debug endpoint and render
 * with an interactive Cytoscape canvas instead of a Mermaid snapshot.
 */
export function inspectModules(
  modules: readonly Module[],
  options: InspectOptions = {},
): Inspection {
  const provideOwners = new Map<string, string>();
  for (const m of modules) {
    for (const key of Object.keys(m.provides)) {
      provideOwners.set(key, m.name);
    }
  }

  const inspectedModules: GraphModule[] = modules.map((m) => {
    const consumer = m.consumer
      ? ({ queue: m.consumer.queue, dlq: m.consumer.dlq } satisfies GraphConsumer)
      : undefined;
    return {
      name: m.name,
      provides: Object.keys(m.provides).sort(),
      requires: [...m.requires].sort(),
      prefix: isRoutedModule(m) ? m.prefix : undefined,
      hasRoutes: isRoutedModule(m),
      ...(consumer ? { consumer } : {}),
    };
  });

  const producers: GraphProducer[] = options.producers
    ? Object.entries(options.producers)
        .map(([name, p]) => ({ name, binding: p.binding }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const edges: GraphEdge[] = [];
  for (const m of modules) {
    for (const key of m.requires) {
      const owner = provideOwners.get(key);
      if (owner && owner !== m.name) {
        edges.push({ from: m.name, to: owner, via: key });
      }
    }
  }

  const routes: GraphRoute[] = [];
  // Hono lists one entry in `.routes` per middleware in a route's chain
  // (validators + handler). Dedupe by `method + path + module` so each
  // user-visible route appears once.
  const seenRoutes = new Set<string>();
  for (const m of modules) {
    if (!isRoutedModule(m)) continue;
    const honoRoutes = (m.routes as { routes?: unknown }).routes;
    if (!Array.isArray(honoRoutes)) continue;
    for (const r of honoRoutes as Array<{ method?: unknown; path?: unknown }>) {
      if (typeof r.method !== 'string' || typeof r.path !== 'string') continue;
      // Skip Hono's catch-all internal entries that aren't real routes.
      if (r.method === 'ALL' && r.path === '*') continue;
      const fullPath = mergePath(m.prefix, r.path);
      const key = `${r.method} ${fullPath} ${m.name}`;
      if (seenRoutes.has(key)) continue;
      seenRoutes.add(key);
      routes.push({ method: r.method, path: fullPath, module: m.name });
    }
  }

  // Stable order: sort routes by path then method, edges by from/to.
  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    modules: inspectedModules,
    edges,
    routes,
    producers,
    mermaid: () => buildMermaid(inspectedModules, edges),
    json: () =>
      JSON.stringify(
        { modules: inspectedModules, edges, routes, producers },
        null,
        2,
      ),
    html: (opts) => buildHtml(inspectedModules, edges, routes, opts),
  };
}

function isRoutedModule(m: Module): m is RoutedModule {
  return 'routes' in m && 'prefix' in m;
}

function mergePath(base: string, sub: string): string {
  if (!base || base === '/') return sub === '' ? '/' : sub;
  if (!sub || sub === '/') return base;
  const a = base.endsWith('/') ? base.slice(0, -1) : base;
  const b = sub.startsWith('/') ? sub : `/${sub}`;
  return `${a}${b}`;
}

function buildMermaid(modules: GraphModule[], edges: GraphEdge[]): string {
  const lines = ['graph TD'];
  for (const m of modules) {
    const meta: string[] = [];
    if (m.prefix) meta.push(m.prefix);
    if (m.provides.length > 0) meta.push(`+${m.provides.length} services`);
    const sub = meta.length > 0 ? `<br/><small>${meta.join(' • ')}</small>` : '';
    lines.push(`  ${m.name}["<b>${m.name}</b>${sub}"]`);
  }
  for (const e of edges) {
    lines.push(`  ${e.from} -->|${e.via}| ${e.to}`);
  }
  return lines.join('\n');
}

function buildHtml(
  modules: GraphModule[],
  edges: GraphEdge[],
  routes: GraphRoute[],
  opts: HtmlOptions = {},
): string {
  const title = opts.title ?? 'katajs — module graph';
  const mermaidSrc = buildMermaid(modules, edges);
  // TODO(Shape B): Shape B's devtools server replaces this static template with
  // a hot-reloading SPA that fetches /__katajs/graph.json from a running app.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #161922;
    --panel-2: #1d2230;
    --text: #e8ebf2;
    --muted: #8b93a7;
    --accent: #7aa2ff;
    --accent-2: #57c7b9;
    --border: #2a3041;
    --get: #57c7b9;
    --post: #7aa2ff;
    --put: #f5a623;
    --patch: #f5a623;
    --delete: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body {
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    margin: 0;
    background: var(--bg);
    color: var(--text);
  }
  header {
    padding: 1.75rem 2rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  header h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
  }
  header .meta {
    color: var(--muted);
    margin-top: 0.25rem;
    font-size: 0.85rem;
  }
  main {
    padding: 1.5rem 2rem 4rem;
    max-width: 1280px;
    margin: 0 auto;
  }
  section + section { margin-top: 2.5rem; }
  section h2 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 600;
    margin: 0 0 0.75rem;
  }
  .graph {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    overflow: auto;
  }
  .graph .mermaid {
    text-align: center;
    color: var(--text);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  th, td {
    text-align: left;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  tr:last-child td { border-bottom: none; }
  th {
    background: var(--panel-2);
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  td.method { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
  td.method[data-m="GET"] { color: var(--get); }
  td.method[data-m="POST"] { color: var(--post); }
  td.method[data-m="PUT"] { color: var(--put); }
  td.method[data-m="PATCH"] { color: var(--patch); }
  td.method[data-m="DELETE"] { color: var(--delete); }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    background: var(--panel-2);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  .pill {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.8rem;
    margin-right: 0.25rem;
    margin-bottom: 0.25rem;
  }
  .pill.requires { color: var(--accent); border-color: rgba(122, 162, 255, 0.3); }
  .pill.provides { color: var(--accent-2); border-color: rgba(87, 199, 185, 0.3); }
  .empty { color: var(--muted); font-style: italic; }
  footer {
    padding: 2rem;
    text-align: center;
    color: var(--muted);
    font-size: 0.8rem;
    border-top: 1px solid var(--border);
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${modules.length} modules • ${edges.length} dependencies • ${routes.length} routes</div>
</header>
<main>
  <section>
    <h2>Module graph</h2>
    <div class="graph">
      <pre class="mermaid">${escapeHtml(mermaidSrc)}</pre>
    </div>
  </section>

  <section>
    <h2>Modules</h2>
    <table>
      <thead><tr><th>Name</th><th>Prefix</th><th>Provides</th><th>Requires</th></tr></thead>
      <tbody>
${modules
  .map(
    (m) => `        <tr>
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td>${m.prefix ? `<code>${escapeHtml(m.prefix)}</code>` : '<span class="empty">—</span>'}</td>
          <td>${
            m.provides.length === 0
              ? '<span class="empty">—</span>'
              : m.provides.map((p) => `<span class="pill provides">${escapeHtml(p)}</span>`).join('')
          }</td>
          <td>${
            m.requires.length === 0
              ? '<span class="empty">—</span>'
              : m.requires.map((p) => `<span class="pill requires">${escapeHtml(p)}</span>`).join('')
          }</td>
        </tr>`,
  )
  .join('\n')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Routes</h2>
    ${
      routes.length === 0
        ? '<p class="empty">No routes mounted.</p>'
        : `<table>
      <thead><tr><th>Method</th><th>Path</th><th>Module</th></tr></thead>
      <tbody>
${routes
  .map(
    (r) => `        <tr>
          <td class="method" data-m="${escapeHtml(r.method)}">${escapeHtml(r.method)}</td>
          <td><code>${escapeHtml(r.path)}</code></td>
          <td>${escapeHtml(r.module)}</td>
        </tr>`,
  )
  .join('\n')}
      </tbody>
    </table>`
    }
  </section>
</main>
<footer>
  Generated by <code>inspectModules()</code> from <code>@katajs/core</code>
</footer>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({
    startOnLoad: true,
    securityLevel: 'loose',
    theme: 'dark',
    themeVariables: {
      darkMode: true,
      background: '#161922',
      primaryColor: '#1d2230',
      primaryTextColor: '#e8ebf2',
      primaryBorderColor: '#2a3041',
      lineColor: '#7aa2ff',
      secondaryColor: '#57c7b9',
      tertiaryColor: '#1d2230',
    },
  });
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
