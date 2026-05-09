---
'create-katajs': minor
'@katajs/cli': minor
'@katajs/core': minor
'@katajs/drizzle': minor
---

**`create-katajs --monorepo --worker`** — adds an `apps/worker/` queue-consumer Worker to the monorepo, deployable independently from `apps/api`.

The shape:

```
my-app/
├── apps/
│   ├── api/                            ← HTTP API (existing)
│   └── worker/                         ← NEW: queue-only Worker
│       ├── package.json                ← @<project>/worker, depends on @<project>/db
│       ├── wrangler.jsonc              ← consumer-only config (no fetch)
│       └── src/
│           ├── index.ts                ← export default { queue }
│           ├── app.ts                  ← createApp returns just `queue`
│           ├── types.d.ts              ← Registry composition
│           └── modules/
│               └── example-consumer/   ← scaffolded starter consumer module
│                   ├── index.ts
│                   ├── example.consumer.ts
│                   └── example.service.ts
└── packages/
    ├── db/                             ← shared (api + worker both use)
    ├── auth/                           ← shared (when --auth)
    └── api-client/                     ← shared
```

Producers and consumers stay decoupled: `apps/api` produces messages via `c.env.QUEUE.send(...)`; `apps/worker` consumes them through its own consumer modules. Each app owns its own modules — **no shared module package**. The two apps communicate only through (1) the queue itself and (2) the shared Drizzle schema in `packages/db`.

If you want to share queue message schemas between the producer and consumer, the recommended pattern is to extract them into a small `packages/events/` package. Not scaffolded by default — keep things simple, add it when you actually need it.

Implementation:

- New `templates/monorepo-worker/` template tree (11 files).
- `--worker` flag on `create-katajs`. Requires `--monorepo`; throws otherwise.
- Interactive prompt added: when `--monorepo` is selected and `--worker` isn't explicit, asks "Include a queue worker app?".
- Root `package.json` augmented with `deploy:api`, `deploy:worker`, and a combined `deploy` script.
- The worker's `app.ts` calls `createApp({ ...modules })` without a `routes` callback — `createApp` returns `{ queue }` and the Worker default-exports `{ queue }`. No `fetch` handler needed.

Type fix in `@katajs/core`: the `Module.consumer?: ConsumerSpec` field type changed to `ConsumerSpec<any>`. Reason: `ConsumerSpec<TBody>` is bivariant on `TBody` (schema is covariant on output, handle is contravariant on input), so `ConsumerSpec<{id: string}>` wasn't assignable to `ConsumerSpec<unknown>` (the default). Using `any` here lets a module's `consumer` field hold a typed consumer spec without the user having to widen at the call site. The consumer's own typing is preserved when accessed.

6 new tests covering: file generation, project-name substitution, queue-only shape (no `fetch:`, no `routes:`), root scripts mutation, `--worker` without `--monorepo` throws, generated consumer uses `defineConsumer`. Workspace total: 161 passing.

End-to-end verified: scaffolded both `--monorepo --worker` and `--monorepo --worker --auth` to temp dirs, installed with workspace overrides, `pnpm typecheck` clean across all 4–5 packages.
