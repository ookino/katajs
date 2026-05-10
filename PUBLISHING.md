# Publishing Kata

End-to-end checklist for the **v0.1.0 first publish** and every subsequent release. Read top to bottom.

> Display name is "Kata"; the npm scope is `@katajs/*`. The five publishable packages are `@katajs/core`, `@katajs/drizzle`, `@katajs/cli`, `@katajs/devtools`, and `create-katajs`. They release in lockstep (configured under `fixed` in `.changeset/config.json`).

## Pre-flight: verify locally

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm -r --filter '@katajs/*' --filter create-katajs build
```

All four must pass before you publish anything.

## Verify what would ship

```bash
for pkg in core drizzle cli katajs-cli devtools; do
  ( cd packages/$pkg && pnpm pack --pack-destination /tmp )
done
ls /tmp/katajs-*.tgz /tmp/create-katajs-*.tgz
tar -tzf /tmp/katajs-core-0.1.0.tgz | head
```

Each tarball should contain `LICENSE`, `README.md`, and `dist/`. Nothing else (no source, no tests, no `tsconfig.json`). `@katajs/devtools`'s tarball additionally carries `dist/ui/` (the Vite-built React bundle) — that's expected.

## Verdaccio dry-run (recommended on every publish)

Verdaccio is a local npm registry — useful for catching publish-time problems without burning real npm versions. The dry-run flow has been validated end-to-end (scaffold → install → typecheck → `pnpm graph` → `katajs add module` → `katajs-devtools` boot).

```bash
# 1. Verdaccio with anonymous-publish config (write a /tmp/verdaccio-config.yaml
#    with packages.*.publish: $anonymous; cf. earlier docs).
pnpm dlx verdaccio --config /tmp/verdaccio-config.yaml --listen 4873 &

# 2. Stub auth so pnpm publish doesn't ENEEDAUTH.
cat > ~/.npmrc <<EOF
@katajs:registry=http://localhost:4873
//localhost:4873/:_authToken=dryrun-stub-token
registry=http://localhost:4873
EOF

# 3. Build + publish at the current package.json versions.
pnpm -r --filter '@katajs/*' --filter create-katajs build
pnpm publish -r --no-git-checks \
  --filter '@katajs/core' --filter '@katajs/drizzle' \
  --filter '@katajs/cli' --filter '@katajs/devtools' --filter create-katajs

# 4. Scaffold against Verdaccio.
cd /tmp && rm -rf dryrun-app
pnpm dlx create-katajs@latest dryrun-app --no-install --no-git
cd dryrun-app
pnpm install
pnpm typecheck
pnpm graph                                       # should write graph.html
pnpm dlx @katajs/cli@latest add module billing   # mutator
pnpm typecheck                                   # still clean
pnpm dlx @katajs/devtools@latest --no-open --port 4811  # boots; serves /api/graph.json

# 5. Tear down + restore.
pkill -f verdaccio
rm ~/.npmrc            # or restore from a backup
```

If every step succeeds, you're clear to publish to real npm.

## v0.1.0 first publish (one-shot, no changesets)

The repo currently ships at v0.1.0 in every `package.json`. There are intentionally no pending changesets — those would drive a *bump past* v0.1.0. The first publish ships the current versions as-is.

```bash
# 1. Login to npm under your account (one-time).
npm login

# 2. Sanity-check everything still passes (run pre-flight above).

# 3. Build for publish.
pnpm -r --filter '@katajs/*' --filter create-katajs build

# 4. Publish all five packages.
pnpm publish -r --access public \
  --filter '@katajs/core' --filter '@katajs/drizzle' \
  --filter '@katajs/cli' --filter '@katajs/devtools' --filter create-katajs

# 5. Tag the release in git.
git tag v0.1.0
git push --tags
```

`pnpm publish -r` reads each package's `version` field and publishes. The `--access public` flag is required for scoped packages on a free npm account.

## Subsequent releases (changeset-driven)

After v0.1.0 is on npm, every PR touching publishable packages adds a changeset that says what changed and how to bump:

```bash
# In a feature branch:
pnpm changeset            # interactive; pick packages, severity, write summary
git add .changeset/<file>.md
git commit -m "feat: <summary>"
```

When changesets queue up on `main`, the release workflow (or manual flow below) consumes them:

```bash
# Manual:
pnpm changeset version    # consumes .changeset/*.md, bumps versions, updates CHANGELOGs
git add . && git commit -m "chore: version packages"
pnpm -r --filter '@katajs/*' --filter create-katajs build
pnpm changeset publish    # publishes any package whose version isn't yet on npm
git push --follow-tags
```

Because all five packages are listed under `fixed` in `.changeset/config.json`, they always share the same version. A bump to one is a bump to all.

## Recommended cadence

The user's stated plan: stay at `0.1.x` until the framework has been pulled and used from real npm a few times and any rough edges are smoothed out. Bump `minor` to `0.2.0` when the surface gains features worth signalling. Cut `1.0.0` only once the API is stable enough to commit to.

This means most early changesets should be `patch` (0.1.0 → 0.1.1 → 0.1.2 …) until you have a coherent reason to call something a feature release.

## GitHub Actions (release workflow)

`.github/workflows/release.yml` runs the changesets/action on every push to `main`. With an `NPM_TOKEN` secret set on the repo (npm → Access Tokens → Granular → scope to `@katajs`), it will:

1. Open a "Version Packages" PR if any pending changesets exist.
2. On merge of that PR, build + publish the bumped versions.

This is the ideal flow for everything past v0.1.0. v0.1.0 itself is easier to ship manually since there are no changesets to consume.

## Post-publish smoke (against real npm)

```bash
cd /tmp && rm -rf smoke-app
pnpm dlx create-katajs@latest smoke-app --no-install --no-git
cd smoke-app && pnpm install && pnpm typecheck
pnpm dlx @katajs/cli@latest add module foo
pnpm typecheck
pnpm dlx @katajs/devtools@latest --no-open --port 4811 &
sleep 4
curl -sS http://127.0.0.1:4811/api/graph.json | head -c 200
pkill -f katajs-devtools
```

If everything still passes against real npm, the release is good.

## Notes

- The npm scope `@katajs` must already be claimed under your account.
- `create-katajs` is unscoped so `npm create katajs@latest` and `pnpm create katajs` both work.
- Templates inside `create-katajs` reference `@katajs/core: "^0.1.0"` (and `@katajs/drizzle: "^0.1.0"`). When the lockstep version bumps to 0.2.0 / 1.0.0, the template version specifiers need to match — a sync sweep before publish.
- The fixed-version lockstep across all five packages is intentional through 1.0.0 and may be relaxed afterward (see `TODO.md`).
