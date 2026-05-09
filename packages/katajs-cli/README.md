# @katajs/cli

Project commands for [katajs](https://github.com/ookino/katajs) apps. Install as a devDependency in your scaffolded project (it's already there if you used `pnpm create katajs`).

```bash
pnpm add -D @katajs/cli
```

## Commands

### `katajs add module <name>`

Scaffolds a new module: `src/modules/<name>/` with the standard 5 files, plus mutations to wire it into the app.

```bash
pnpm katajs add module comments
```

Generates:
- `src/modules/comments/index.ts` — `defineModule` call + `CommentsRegistry` type export
- `src/modules/comments/comments.service.ts` — service factory with a `ping()` example method
- `src/modules/comments/comments.routes.ts` — Hono routes with one example `GET /`
- `src/modules/comments/comments.schema.ts` — Zod schema starter
- `src/modules/comments/comments.errors.ts` — `AppError` subclass starter

Mutates:
- `src/types.d.ts` — adds `CommentsRegistry` import + extends entry
- `src/app.ts` — adds `commentsModule` import, modules-array entry, and route mount
- `scripts/graph.ts` — adds `commentsModule` to the graph script (if present)

The mutations rely on anchor comments (`// katajs:registry`, `// katajs:modules`, `// katajs:routes`, etc.) that ship in the scaffolder templates. If you've removed them, the command prints the snippet for manual paste instead of failing.

#### Naming

Names are normalized into kebab-case (directory), camelCase (variable), PascalCase (type), and snake_case (error code):

```bash
katajs add module user-profile
# directory: src/modules/user-profile/
# variable:  userProfileModule, userProfileService
# type:      UserProfileService, UserProfileRegistry, UserProfileNotFoundError
# code:      'user_profile_not_found'
```

Names must start with a letter and contain only letters, digits, and hyphens.

### `katajs add service <name> --in <module>`

Adds a single service to an existing module.

```bash
pnpm katajs add service featured --in posts
```

Generates `src/modules/posts/featured.service.ts` and wires it into the module's `index.ts`:

- New `import { makeFeaturedService, type FeaturedService } from './featured.service';` line
- New `featuredService: (c) => makeFeaturedService(c),` entry in `provides`
- New `featuredService: FeaturedService;` entry in the `PostsRegistry` slice

The mutations target the `// katajs:module-service-imports`, `// katajs:module-provides`, and `// katajs:module-registry` anchors that ship in scaffolded modules.

### `katajs add route <method> <path> --in <module>`

Appends a new route handler to a module's `<module>.routes.ts` chain.

```bash
pnpm katajs add route post /comments --in posts
```

Methods: `get`, `post`, `put`, `patch`, `delete`, `options`, `head`. Path must start with `/`. The handler is inserted before the `// katajs:module-routes` anchor with a `// TODO: implement <METHOD> <path>` body.

### `katajs add queue <name> --in <module>`

Adds a queue consumer to an existing module — generates the consumer file, wires it into the module via anchors, and prints wrangler.jsonc + Bindings type snippets for manual paste.

```bash
pnpm katajs add queue orders --in orders
pnpm katajs add queue order-events --in posts --dlq ORDER_EVENTS_DLQ
pnpm katajs add queue analytics --in analytics --batch
```

Flags:

- `--in <module>` *(required)* — target module
- `--binding <BINDING>` *(optional)* — wrangler binding name. Default: `<NAME>_QUEUE` (kebab → SCREAMING_SNAKE)
- `--dlq <DLQ_BINDING>` *(optional)* — dead-letter queue binding. When set, the generated consumer adds `dlq:` and `maxRetries: 5`
- `--batch` *(optional flag)* — generate `handleBatch` instead of `handle`

Generates `src/modules/<module>/<name>.consumer.ts` using `defineConsumer` from `@katajs/core` (drives full contextual typing on the handler — `message.body` is inferred from the schema, no `any`). Mutates `<module>/index.ts` to import the consumer and add it to `defineModule({ ..., consumer: <name>Consumer })` via the `// katajs:module-service-imports` and `// katajs:module-consumer` anchors.

Two manual paste steps the CLI doesn't auto-mutate (because both touch user-customizable territory):

1. **wrangler.jsonc** — add the producer, consumer, and (if `--dlq`) DLQ producer entries to the `queues` block.
2. **`Bindings` type** in `src/app.ts` — add `<BINDING>: Queue<XxxEvent>` so `c.env.<BINDING>.send(...)` typechecks.

Both snippets are printed by the command, ready to paste.

### Coming in later versions

- `katajs add migration <name>`
- `katajs add cron <name>`
- `katajs add do <name>`
- `katajs upgrade`

## How it works

The CLI walks up from your current working directory looking for a `package.json` that declares `@katajs/core`. If found, that's your project root and `src/` is where files land. Run `katajs add module foo` from anywhere inside your project — the CLI finds the right place.

## License

[MIT](./LICENSE) © Yaseer A. Okino
