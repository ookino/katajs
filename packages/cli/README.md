# create-katajs

Scaffolding CLI for [katajs](https://github.com/ookino/katajs) projects.

```bash
pnpm create katajs my-app
# or
npm create katajs@latest my-app
# or
yarn create katajs my-app
```

## Flags

```bash
pnpm create katajs my-app [options]

Options:
  --auth                  Add Better Auth scaffolding
  --pm <pm>               Package manager (pnpm | npm | yarn | bun)
  --no-install            Skip install step
  --no-git                Skip git init
  -h, --help              Show help
```

If you omit a name or skip flags, the CLI prompts interactively.

## What you get

A single-API Cloudflare Workers project with:

- `@katajs/core` runtime + `@katajs/drizzle` adapter wired up
- One example `posts` module (schema, repository, service, routes, errors)
- Drizzle config + migration setup
- `wrangler.jsonc` with Hyperdrive binding placeholder
- `.dev.vars.example`
- `.github/workflows/deploy.yml` stub
- README with next-step instructions

With `--auth`, you also get a `src/modules/auth/` integrating [Better Auth](https://better-auth.com), Better Auth tables added to your Drizzle schema, and a protected route on the example module.

## After scaffolding

```bash
cd my-app

# 1. Configure your Hyperdrive binding in wrangler.jsonc
#    (see https://developers.cloudflare.com/hyperdrive/ to create one)

# 2. Generate migrations from the schema
pnpm db:generate

# 3. Run dev server
pnpm dev
```

## License

[MIT](./LICENSE) © Yaseer A. Okino
