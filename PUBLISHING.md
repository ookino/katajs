# Publishing katajs

End-to-end checklist for the v0.1.0 (or any future) release. Read top to bottom.

## Pre-flight: verify locally

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

All four must pass. The included `.changeset/initial-release.md` already covers v0.1.0; new releases need a fresh changeset (`pnpm changeset`).

## Verify what would ship

```bash
cd packages/core   && pnpm pack --pack-destination /tmp && tar -tzf /tmp/katajs-core-*.tgz
cd packages/drizzle && pnpm pack --pack-destination /tmp && tar -tzf /tmp/katajs-drizzle-*.tgz
cd packages/cli     && pnpm pack --pack-destination /tmp && tar -tzf /tmp/create-katajs-*.tgz
```

Each tarball should contain `LICENSE`, `README.md`, and `dist/`. Nothing else (no source, no tests, no `tsconfig.json`).

## Verdaccio dry-run (optional but recommended for first publish)

Verdaccio is a local npm registry — useful for catching publish-time problems without burning real npm versions.

```bash
# 1. Install + run Verdaccio
npm install -g verdaccio
verdaccio &
# Verdaccio runs on http://localhost:4873

# 2. Create a Verdaccio user (one-time)
npm adduser --registry http://localhost:4873

# 3. Version + publish to Verdaccio
pnpm changeset version
pnpm build
pnpm publish -r --no-git-checks --registry http://localhost:4873

# 4. In another directory, scaffold against Verdaccio
cd /tmp
npm create katajs@latest dryrun-app --registry http://localhost:4873 -- --no-install
cd dryrun-app
npm install --registry http://localhost:4873
npm run typecheck

# 5. Tear down Verdaccio
kill %1
# And reset the version bump in your repo:
git checkout packages/*/package.json .changeset/
```

If the scaffold typechecks against the published packages, you're clear to publish to real npm.

## GitHub repo setup

Once you create `github.com/ookino/katajs`:

```bash
git remote add origin git@github.com:ookino/katajs.git
git branch -M main
git push -u origin main
```

The included `.github/workflows/ci.yml` runs typecheck + test + build on every PR.

The included `.github/workflows/release.yml` is wired up to publish via Changesets. To enable it, add an `NPM_TOKEN` secret to the repo (npm → Access Tokens → Generate New Token → Automation, with the `@katajs` scope).

## Real publish (manual)

When you're ready:

```bash
# 1. Login to npm under the @katajs scope (one-time)
npm login

# 2. Bump versions and update CHANGELOGs
pnpm changeset version
git add . && git commit -m "chore: version packages for v0.1.0"

# 3. Build and publish
pnpm build
pnpm changeset publish

# 4. Push the version commit + tags
git push --follow-tags
```

`pnpm changeset publish` reads each package's `version` and publishes. Because all three are linked in `.changeset/config.json`, they release together.

## Real publish (automated)

If you set up `NPM_TOKEN` in the repo secrets, the `release.yml` workflow handles all of the above on every merge to `main`:

1. If unreleased changesets exist, it opens a "Version Packages" PR.
2. Merging that PR triggers a publish to npm.

This is the ideal flow once the repo is live.

## Post-publish smoke

```bash
cd /tmp
npm create katajs@latest smoke-app
cd smoke-app
pnpm typecheck
```

If that works against real npm, the release is good.

## Notes

- The npm scope `@katajs` must already be claimed under your account. Confirmed.
- `create-katajs` is unscoped (no `@` prefix) so `npm create katajs@latest` and `pnpm create katajs` both work.
- Bundle size today: `@katajs/core` ≈ 16KB. The 10KB stretch goal is a v0.2 task.
- All three packages release in lockstep (configured in `.changeset/config.json` under `fixed`). One package version bump, all three publish.
