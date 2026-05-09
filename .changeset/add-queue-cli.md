---
'@katajs/cli': minor
'@katajs/core': minor
'@katajs/drizzle': minor
'create-katajs': minor
---

**`katajs add queue <name> --in <module>`** — new CLI command for scaffolding queue consumers on existing modules.

Generates `src/modules/<module>/<name>.consumer.ts` with a Zod schema starter and a `handle` (or `handleBatch` with `--batch`) function. Wires it into the module's `index.ts` via the `// katajs:module-service-imports` and the new `// katajs:module-consumer` anchor. Prints `wrangler.jsonc` queue binding snippets and a `Bindings` type snippet for manual paste — those parts touch user-customizable territory and aren't auto-mutated.

Flags: `--binding <BINDING>` (default: `<NAME>_QUEUE`), `--dlq <DLQ_BINDING>` (adds `dlq:` and `maxRetries: 5` to the spec), `--batch` (generate `handleBatch` instead of `handle`).

In **`@katajs/core`**:

- New `defineConsumer<TBody>(spec)` helper. Drives contextual typing for the inner `handle` / `handleBatch` callbacks so `message.body` is inferred from the schema instead of widening to `unknown` (which is what bare `satisfies` produces). The generated consumer template uses this helper.
- `ConsumerSpec` type generic relaxed: now `ConsumerSpec<TBody = unknown>` (was `ConsumerSpec<TSchema extends MessageSchema>`). `handle` and `handleBatch` are now both optional at the type level — runtime validates that exactly one is present and throws clearly otherwise. The previous discriminated-union form fought TypeScript's `satisfies` and contextual-typing inference.

Templates updated with the new `// katajs:module-consumer` anchor at the end of the `defineModule({ ... })` call. Same anchor added to `examples/basic/posts` and all five `examples/showcase` modules so `katajs add queue --in <module>` works against any of them.

9 new tests in `@katajs/cli` (file generation, anchor mutation, casing derivation, `--binding` override, `--dlq` field, `--batch` mode, refusal on existing file, missing-module rejection, anchor-fallback graceful behaviour). Workspace total: 148 passing.
