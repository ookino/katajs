# @katajs/devtools

> Live interactive devtools for [Kata](https://github.com/ookino/katajs) apps — module graph, drawer, routes table, queue producer/consumer view, Cmd+K palette. Hot-reloads as you edit.

`@katajs/devtools` is a dev-dependency-only package. It runs locally, reads your project's `scripts/modules.ts`, and serves a React UI from a small Node HTTP server with a chokidar watcher pushing updates over Server-Sent Events. No telemetry, no remote anything.

## Install

```bash
pnpm add -D @katajs/devtools
```

A Kata project (`pnpm create katajs my-app`) ships with `scripts/modules.ts` that exports a canonical `modules` tuple — that's what devtools imports. If your project predates the `scripts/modules.ts` convention, devtools also accepts a legacy `scripts/graph.ts` that exports `modules`.

## Run

```bash
npx katajs-devtools
#   katajs-devtools — interactive module graph
#   ➜ Local: http://127.0.0.1:4242
```

The bin opens a browser to the UI. Edit anything under `src/modules/**` or `scripts/modules.ts` and the canvas hot-reloads.

## CLI flags

| Flag | Default | Notes |
|---|---|---|
| `--port <port>` | `4242` | Auto-bumps if busy. |
| `--host <host>` | `127.0.0.1` | Pass `0.0.0.0` to bind all interfaces. |
| `--no-open` | — | Don't auto-launch the browser. |
| `--modules-file <path>` | auto-detect | Override the location of the modules file. |

## What you see

- **Graph canvas** — React Flow with dagre auto-layout. Each module is a card showing its prefix, provides count, requires count, route count, and a `consumes <BINDING>` line for queue consumers.
- **Module sidebar** — every module with at-a-glance counts; a Producers section appears below if `createApp({ queues })` is declared.
- **Module drawer** (right side, on selection) — full provides chips, requires with clickable backlinks, owned routes, and a "Consumes" section listing queue + DLQ + the producer that feeds it.
- **Producer drawer** — click a producer in the sidebar to see the typed `c.var.queues.<name>.send(body)` call and the consumer modules that read from the same binding.
- **Routes view** — flat searchable table; method-coloured chips with a free-text + per-method filter.
- **Cmd+K palette** — fuzzy-search across modules, producers, and routes; selecting jumps to the appropriate view.

## How the data flows

```
scripts/modules.ts (your modules tuple)
        │ tsx ESM register
        ▼
inspectModules() ──────► JSON over /api/graph.sse ──────► React UI
        ▲                                                     │
        │  chokidar re-fires on src/modules/** change         │  Cmd+K, click,
        └─────────────────────────────────────────────────────┘  filter
```

The data contract is the [`Inspection`](https://www.npmjs.com/package/@katajs/core) shape from `@katajs/core`. Anything renderable in the static `pnpm graph` snapshot is navigable here, with cross-module backlinks and live updates on top.

## Endpoints (advanced)

While the bin is running:

- `GET /` — the React UI bundle.
- `GET /api/graph.json` — pretty-printed `Inspection` JSON, fresh on each request.
- `GET /api/graph.sse` — Server-Sent Events stream emitting `event: graph` with compact JSON on every snapshot change.

Useful if you want to feed the graph into something else (e.g. a CI artefact step).

## License

MIT © Yaseer A. Okino
