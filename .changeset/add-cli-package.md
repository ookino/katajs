---
'@katajs/cli': minor
'@katajs/core': minor
'@katajs/drizzle': minor
'create-katajs': minor
---

**`@katajs/cli`** — new package shipping in-project commands. v0.1 ships `katajs add module <name>`: scaffolds a new module with 5 files (index, service, routes, schema, errors) and wires it into `src/types.d.ts`, `src/app.ts`, and `scripts/graph.ts` via anchor-comment codemods. Falls back to printing the snippet for manual paste if anchors are missing.

**`create-katajs`** — scaffolder templates now include anchor markers (`// katajs:registry`, `// katajs:modules`, `// katajs:routes`, etc.) so future `katajs add` commands can mutate generated projects automatically. The auth augmentation path was refactored to use the same anchor-based codemod helpers.

**`@katajs/core`** and **`@katajs/drizzle`** versions bump in lockstep but ship no code changes in this release.
