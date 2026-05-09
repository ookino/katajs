---
'@katajs/cli': minor
'@katajs/core': minor
'@katajs/drizzle': minor
'create-katajs': minor
---

**`@katajs/cli`** — new package shipping in-project commands. v0.2 ships three:

- **`katajs add module <name>`** — scaffolds a new module with 5 files (index, service, routes, schema, errors) and wires it into `src/types.d.ts`, `src/app.ts`, and `scripts/graph.ts`.
- **`katajs add service <name> --in <module>`** — adds a single service to an existing module and wires it into the module's `provides`, Registry slice, and imports.
- **`katajs add route <method> <path> --in <module>`** — appends a new route handler to a module's `<module>.routes.ts` chain with a `// TODO` stub.

All mutations target anchor-comment markers; falls back to printing the snippet for manual paste if anchors are missing or have been customized.

**`create-katajs`** — scaffolder templates now include anchor markers (app-level: `// katajs:registry`, `// katajs:modules`, `// katajs:routes`; module-level: `// katajs:module-service-imports`, `// katajs:module-provides`, `// katajs:module-registry`, `// katajs:module-routes`) so the `katajs add` family can mutate generated projects automatically. The `--auth` augmentation path was refactored to use the same anchor-based codemod helpers.

**`@katajs/core`** and **`@katajs/drizzle`** versions bump in lockstep but ship no code changes in this release.
