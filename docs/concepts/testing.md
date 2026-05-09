# Testing

katajs has two test layers: unit tests for services with `makeTestContainer`, and integration tests against a real database for the bits that depend on SQL behaviour. Both work with vitest. The framework doesn't ship a "test mode" runtime — you test your code, not your `createApp` configuration.

## Two layers, two purposes

| Layer | What it tests | What it uses |
|---|---|---|
| **Unit** | Service logic, error paths, cross-service composition | `makeTestContainer` from `@katajs/core/testing` + vitest mocks |
| **Integration** | SQL behaviour, transaction semantics, route handlers end-to-end | Real Postgres, the actual `createApp({...})` output, `app.request(...)` |

Most of your tests should be unit tests. Integration tests cover the critical paths where you'd be uneasy if a unit test passed but production failed (transactions are the obvious one).

## Unit tests with `makeTestContainer`

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeTestContainer } from '@katajs/core/testing';
import { makePostService } from '../src/modules/posts/posts.service';

describe('postService.create', () => {
  it('inserts a post and writes an audit log entry', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'p1', title: 't' });
    const log = vi.fn();

    const c = makeTestContainer({
      services: {
        postRepository: { findById: vi.fn(), insert },
        auditService: { log },
      },
    });

    const service = makePostService(c);
    const post = await service.create({ title: 't', body: 'b', authorId: 'alice' });

    expect(insert).toHaveBeenCalledWith({ title: 't', body: 'b', authorId: 'alice' });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: 'post.created' }));
    expect(post).toEqual({ id: 'p1', title: 't' });
  });

  it('throws PostNotFoundError when getById misses', async () => {
    const c = makeTestContainer({
      services: {
        postRepository: { findById: vi.fn().mockResolvedValue(undefined) },
      },
    });
    const service = makePostService(c);
    await expect(service.getById('missing')).rejects.toThrow(/not found/i);
  });
});
```

`makeTestContainer` builds a `RequestContainer` with the same public shape as the real one. You wire fakes for whatever services your code resolves; it errors loudly if you forget one:

```
[makeTestContainer] No service registered for key 'auditService'.
Pass it via `services: { auditService: ... }`.
Currently registered: postRepository.
```

That's the design — no silent passes, no auto-mocks. Forgetting a service is exactly the bug you'd hit in production, so the test should fail.

## What `makeTestContainer` provides

```ts
export type TestContainerOptions = {
  services?: Partial<Record<RegistryKey, unknown>>;
  db?: AppDb;
  env?: AppEnv;
  requestId?: string;
  runTransaction?: <T>(fn: (tx: RequestContainer) => Promise<T>) => Promise<T>;
};
```

| Option | Default | When you'd override |
|---|---|---|
| `services` | `{}` | Always — pass your fakes here. |
| `db` | `{}` | If your service touches `c.db` directly (rare; usually services go through repositories). |
| `env` | `{}` | If your service reads `c.env.SOME_BINDING`. |
| `requestId` | `'test-request'` | If you need to assert correlated logs across services. |
| `runTransaction` | passes through (no-op) | When you need to assert tx-only behaviour, e.g. that an inner call sees the same `tx` reference. |

By default `withTransaction(fn)` just calls `fn(container)` against the same container — your services run as if there's a transaction, but nothing transactional happens. This is fine for unit tests of service logic; transaction *behaviour* (rollback, isolation) is what integration tests are for.

## Integration tests with real Postgres

For the showcase, integration tests hit a local Postgres and exercise the actual `createApp({...})`-built Hono app:

```ts
// examples/showcase/test/integration.test.ts (sketch)
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/app';
import { applyTestSchema, truncateAll, TEST_DB_URL } from './setup-db';

beforeEach(async () => {
  await truncateAll();
});

describe('POST /posts', () => {
  it('creates a post and writes an audit log entry in one transaction', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The showcase's wrangler binding is hand-stubbed at request time:
      },
      body: JSON.stringify({ title: 't', body: 'b', authorId: 'alice' }),
    }, {
      HYPERDRIVE: { connectionString: TEST_DB_URL },  // bindings shape
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.post.title).toBe('t');

    // Verify audit log was written:
    const auditRes = await app.request('/audit/logs?actor=alice');  // pseudo
    // ...
  });
});
```

Integration tests are slower (the showcase's 31 take ~1.3s) but they catch issues that unit tests can't:

- The transaction actually committed/rolled back at the SQL level.
- Drizzle's generated SQL matches your schema.
- Hono's route matching, validation, and error rendering compose correctly.
- The full request → container → service → repository → SQL pipeline works.

## The `tsconfig` split (preventing Registry pollution)

A subtle but important detail: tests sometimes need to add throwaway services to the Registry. If a test file does

```ts
declare module '@katajs/core' {
  interface Registry {
    dummyService: SomeFakeShape;
  }
}
```

…and your `tsconfig.json` `include` covers both `src/` and `test/`, the `dummyService` augmentation pollutes your *real* code's autocomplete. Every `c.var.resolve(...)` shows `dummyService` as a valid key everywhere.

Fix: split the tsconfigs.

```jsonc
// tsconfig.json — used for src checks (and for IDE features)
{
  "include": ["src/**/*"]
}
```

```jsonc
// tsconfig.test.json — used by vitest and for testing tsc check
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*", "test/**/*"]
}
```

```jsonc
// package.json
"scripts": {
  "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json"
}
```

```ts
// vitest.config.ts (if you use path aliases)
export default defineConfig({
  resolve: {
    alias: {
      // matches your tsconfig.test.json paths
    },
  },
});
```

The IDE typechecks against `tsconfig.json` (which excludes tests), so test-only Registry augmentations stay out of `src/` autocomplete. Vitest uses `tsconfig.test.json` (which includes everything), so test files compile correctly.

The scaffolder ships this split out of the box.

## Test-pyramid recommendation

A reasonable mix for a katajs project:

| Test type | Count, roughly | What it covers |
|---|---|---|
| **Unit tests** | Many — one per service method × meaningful branches | Service logic, error paths, cross-service composition. Fast (~ms each). |
| **Integration tests** | Few — one per critical write path | Transactions, multi-service SQL, end-to-end route behaviour. Slower (~50–200ms each). |
| **Type-level tests** (optional) | A handful | RPC client typing, Registry composition. Use `expect-type` (already in `@katajs/core`'s devDeps). |

You don't need to cover every route handler with an integration test — most are thin wrappers around services. Cover the ones where the SQL behaviour matters (transactions, complex queries, foreign-key cascades).

## Things you don't need to test

- **`createApp` boot validation.** It's tested in `@katajs/core`. Trust it.
- **The container's resolve cycle detection.** Same.
- **`validate()`'s Zod integration.** Tested in `@katajs/core`.
- **`errorMapper`'s response shape.** Tested in `@katajs/core`.

Your tests focus on *your code* — services, repositories, error classes. The framework's contracts are someone else's problem (mine, and they have 88 tests on the framework side covering them).

## Common patterns

### Test a service's error path

```ts
it('throws ForbiddenPostError when actorId differs', async () => {
  const c = makeTestContainer({
    services: {
      postRepository: {
        findById: vi.fn().mockResolvedValue({ id: '1', authorId: 'bob' }),
      },
      auditService: { log: vi.fn() },
    },
  });
  await expect(
    makePostService(c).deleteOwned({ id: '1', actorId: 'alice' }),
  ).rejects.toThrow(/Forbidden/);
});
```

### Test that a service composes another correctly

```ts
it('records an audit entry when creating a post', async () => {
  const log = vi.fn();
  const c = makeTestContainer({
    services: {
      postRepository: { insert: vi.fn().mockResolvedValue({ id: '1' }) },
      auditService: { log },
    },
  });
  await makePostService(c).create({ title: 't', body: 'b', authorId: 'alice' });
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'post.created', actorId: 'alice' }),
  );
});
```

### Test that the right `tx` is threaded through

```ts
it('passes the tx container to nested services', async () => {
  let txSeenByAudit: unknown;
  const c = makeTestContainer({
    services: {
      postRepository: { insert: vi.fn().mockResolvedValue({ id: '1' }) },
      auditService: {
        log: vi.fn(async () => { /* would resolve from tx in real life */ }),
      },
    },
  });
  // Drop in a tx runner that captures the container handed to fn:
  const customC = makeTestContainer({
    services: c.resolve as never,  // not quite — see makeTestContainer source
    runTransaction: async (fn) => {
      const tx = makeTestContainer({ services: { /* tx-bound fakes */ } });
      txSeenByAudit = tx;
      return fn(tx);
    },
  });
  // ... Easier in practice to assert on the call args of the mocked services.
});
```

### A type-level test

```ts
import { expectTypeOf } from 'expect-type';
import type { AppType } from '../src/app';
import type { hc } from 'hono/client';

it('client.posts.$post is typed correctly', () => {
  type Client = ReturnType<typeof hc<AppType>>;
  expectTypeOf<Parameters<Client['posts']['$post']>[0]['json']>().toEqualTypeOf<{
    title: string;
    body: string;
  }>();
});
```

These don't run at test time (`expectTypeOf` is type-only), but they fail to compile if the schema breaks the contract — caught in `pnpm typecheck`.

## Summary

- Use `makeTestContainer` from `@katajs/core/testing` for unit tests.
- Use real Postgres + `app.request(...)` for integration tests.
- Split `tsconfig.json` and `tsconfig.test.json` to keep test Registry augmentations out of `src/`.
- Cover service logic with unit tests; cover SQL/transaction behaviour with a few integration tests.
- Don't test the framework — it's tested upstream.
