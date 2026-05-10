# @katajs/devtools

## 1.0.0

### Minor Changes

- 74177b1: **Devtools Shape B: live interactive module graph.** New `@katajs/devtools` package shipping the `katajs-devtools` bin. `npx katajs-devtools` from your project root spins up a local server (default `:4242`), imports your `scripts/modules.ts` in-process via tsx's ESM register, runs `inspectModules()`, and serves the result over HTTP + Server-Sent Events. A chokidar watcher on `src/modules/**` and `scripts/modules.ts` re-runs the inspection on every save and pushes new snapshots to the UI — the canvas hot-reloads without a refresh.

  The UI:

  - **Graph canvas** (React Flow + dagre auto-layout) with custom module nodes showing prefix, provides/requires counts, and route counts.
  - **Module sidebar** listing every module with at-a-glance counts.
  - **Module drawer** (right side, on selection): full provides chips, requires with clickable `← provided by X` backlinks, and the routes owned by the module.
  - **Routes view** with method-coloured chips, free-text filter, and per-method filter chips.
  - **Cmd+K palette** (cmdk) fuzzy-searching across modules and routes.

  CLI flags: `--port` (auto-bumps if busy), `--host`, `--no-open`, `--modules-file`.

  Stack: Vite + React 18 + Tailwind + React Flow + cmdk + chokidar + tsx. No telemetry, no remote anything — entirely local. Bundle: 428 KB / 139 KB gzipped.

  **New convention: `scripts/modules.ts` is the canonical modules tuple.** Both `pnpm graph` (Shape A) and `katajs-devtools` (Shape B) import from it. The scaffolder ships this split by default; `katajs add module` writes its inserts to `scripts/modules.ts`. The `--auth` (single-API) and `--monorepo --auth` paths in `create-katajs` were updated to write to `modules.ts` too.

  Existing scaffolded projects can either:

  1. Manually split: extract the `modules` array from `scripts/graph.ts` into a new `scripts/modules.ts` (with `export`), then have `graph.ts` `import { modules } from './modules'`.
  2. Rely on devtools' fallback: `katajs-devtools` looks for `scripts/modules.ts` first, then falls back to `scripts/graph.ts` if the latter exports `modules`.

  In `@katajs/core`: no API changes — Shape B consumes the existing `Inspection` shape from `inspectModules()`.

  Tests: 8 new in `@katajs/devtools/test/loader.test.ts` covering `resolveModulesFile` priority + override + missing-file error, and `loadInspection` happy path + missing-export error. Workspace total: 180+ passing.

### Patch Changes

- Updated dependencies [509cf60]
- Updated dependencies [fd7ad5d]
- Updated dependencies [3e00f64]
- Updated dependencies [0bcb800]
- Updated dependencies [7489ea8]
- Updated dependencies [4135e24]
- Updated dependencies [8296502]
- Updated dependencies [6d74447]
  - @katajs/core@1.0.0
