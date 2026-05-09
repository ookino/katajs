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

### Coming in v0.2

- `katajs add service <name> --in <module>`
- `katajs add route <method> <path> --in <module>`
- `katajs add migration <name>`
- `katajs add queue <name>`
- `katajs add cron <name>`
- `katajs upgrade`

## How it works

The CLI walks up from your current working directory looking for a `package.json` that declares `@katajs/core`. If found, that's your project root and `src/` is where files land. Run `katajs add module foo` from anywhere inside your project — the CLI finds the right place.

## License

[MIT](./LICENSE) © Yaseer A. Okino
