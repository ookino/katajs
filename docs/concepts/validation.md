# Validation

`validate({ body, query, param })` is katajs's wrapper around [`@hono/zod-validator`](https://github.com/honojs/middleware/tree/main/packages/zod-validator). It validates request inputs at the route boundary using Zod schemas, throws a typed `ValidationError` on failure, and preserves Hono's RPC type inference end-to-end so clients get the validated input types automatically.

## The shape

```ts
import { Hono } from 'hono';
import { validate } from '@katajs/core';
import { z } from 'zod';

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});

const PostIdParam = z.object({
  id: z.string().uuid(),
});

export const postsRoutes = new Hono<AppEnv>()
  .post('/', ...validate({ body: CreatePostSchema }), async (c) => {
    const input = c.req.valid('json');  // typed as z.infer<typeof CreatePostSchema>
    return c.json({ post: await c.var.resolve('postService').create(input) });
  })
  .get('/:id', ...validate({ param: PostIdParam }), async (c) => {
    const { id } = c.req.valid('param');  // typed as { id: string }
    return c.json({ post: await c.var.resolve('postService').getById(id) });
  });
```

Three things to notice:

- `validate({...})` returns a **tuple of middlewares**. You spread it (`...validate(...)`) into the route's middleware position.
- `c.req.valid('json' | 'query' | 'param')` returns the inferred Zod input — fully typed.
- Both can mix: `validate({ body, query, param })` adds three middlewares to the route, one per source.

## Why a tuple, not a single middleware

Hono's RPC type inference walks the route definition: each middleware in the chain narrows the request type. `@hono/zod-validator` is built to do this — passing it as a single `zValidator(target, schema)` middleware preserves the inference. But a route handler often needs to validate body *and* query *and* params; stacking three `zValidator` calls inline gets noisy:

```ts
// Without `validate`:
.post(
  '/',
  zValidator('json', CreatePostSchema, throwHook),
  zValidator('query', SomeQuery, throwHook),
  zValidator('param', SomeParam, throwHook),
  async (c) => { /* ... */ }
)
```

`validate({...})` is sugar that produces the same tuple of `zValidator(...)` middlewares with a shared throw-on-failure hook. The route reads cleaner:

```ts
// With `validate`:
.post(
  '/',
  ...validate({ body: CreatePostSchema, query: SomeQuery, param: SomeParam }),
  async (c) => { /* ... */ }
)
```

## How failure becomes a `ValidationError`

`@hono/zod-validator` accepts a hook that runs after each validation attempt. `validate()` installs a hook that throws:

```ts
function makeHook(label: 'body' | 'query' | 'param') {
  return (result, _c) => {
    if (!result.success && result.error) {
      const issues = result.error.issues.map((i) => ({
        path: [label, ...i.path],
        message: i.message,
      }));
      throw new ValidationError(issues);
    }
  };
}
```

The throw propagates through Hono's call stack and lands in [`errorMapper`](./errors.md), which maps `ValidationError` (an `AppError` subclass) to a 400 response with structured issue data:

```json
{
  "error": "validation_failed",
  "message": "Request validation failed",
  "issues": [
    { "path": ["body", "title"], "message": "Required" },
    { "path": ["body", "body"],  "message": "String must contain at least 1 character(s)" }
  ],
  "requestId": "..."
}
```

The `path` prefix tells the client *where* the issue is — `body`, `query`, or `param` — followed by the Zod-reported path inside that source. A field validator on `body.title` shows up as `["body", "title"]`; a refinement on the whole body shows up as just `["body"]`.

## RPC type flow

The whole point of using `@hono/zod-validator` (over a hand-rolled validator) is that Hono's RPC client gets the typed input shapes for free. Given:

```ts
// src/app.ts
export type AppType = typeof app;
```

```ts
// any TypeScript client
import { hc } from 'hono/client';
import type { AppType } from '../api/src/app';

const client = hc<AppType>('https://api.example.com');

const res = await client.posts.$post({
  json: {
    title: 'hi',          // ← required, must be a string
    body: 'world',        // ← required, must be a string
    // anyExtraField: 1,  // ← TS error: unknown property
  },
});
const data = await res.json();  // ← typed
```

The client's `json` parameter is typed as `z.infer<typeof CreatePostSchema>` because `validate({ body: CreatePostSchema })` flowed that type into the route. No code generation, no separate API spec — the schema *is* the source of truth.

This also works for query strings and route params:

```ts
// Server:
.get('/:id', ...validate({ param: PostIdParam, query: ListQuery }), ...)

// Client:
await client.posts[':id'].$get({
  param: { id: '...' },        // typed as z.infer<typeof PostIdParam>
  query: { page: '1' },        // typed as z.infer<typeof ListQuery>
});
```

## Where to put schemas

By convention, in each module's `<module>.schema.ts`:

```ts
// src/modules/posts/posts.schema.ts
import { z } from 'zod';

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

export const PostIdParam = z.object({
  id: z.string().uuid(),
});
export type PostIdParamInput = z.infer<typeof PostIdParam>;
```

The schema definitions and their inferred TypeScript types live together. Routes import them; services accept the inferred type as their input parameter. The DB layer doesn't need them — Drizzle generates its own `NewPost` and `Post` types from the schema; you can adapt one to the other in the service.

```ts
// src/modules/posts/posts.service.ts
export type PostsService = {
  create(input: CreatePostInput): Promise<Post>;
  // ...
};
```

## Things validation is NOT for

`validate()` runs at the route boundary. It checks that the request looks plausible. It doesn't:

- **Authorize.** "User can edit this post" is a separate concern. Throw `ForbiddenPostError` from the service.
- **Check uniqueness.** "Email is already taken" requires a database query. Throw `EmailTakenError` from the repository or service.
- **Validate cross-field business rules.** "Discount must be ≤ price." Zod can do simple cases via `.refine()`, but complex rules belong in the service so the error message reflects domain language.

The pattern: validate *shape and types* at the route boundary; validate *invariants and authorization* in the service. Both throw `AppError` subclasses; both flow through `errorMapper`.

## Optional: validate in middleware vs route

You can also call `validate({...})` outside a route handler — e.g., in a custom middleware that wants to enforce a header schema across many routes:

```ts
import { defineMiddleware } from '@katajs/core';

const HeaderSchema = z.object({
  'x-tenant-id': z.string().uuid(),
});

export const requireTenant = defineMiddleware(async (c, next) => {
  // No `validate({ header: ... })` API yet — for now, do it manually:
  const result = HeaderSchema.safeParse(Object.fromEntries(c.req.raw.headers));
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: ['header', ...i.path], message: i.message }))
    );
  }
  await next();
});
```

A `validate({ header: ... })` extension is on the v0.3 wishlist.

## Why not pipe `c.req.json()` through schemas in handlers?

Some Hono codebases parse and validate inline:

```ts
.post('/', async (c) => {
  const raw = await c.req.json();
  const input = CreatePostSchema.parse(raw);  // throws on failure
  // ...
});
```

This works at runtime, but two things break:

1. **No RPC types.** The client doesn't know the request body's shape — `client.posts.$post({ json: ... })` accepts `unknown`.
2. **No standardized error.** `CreatePostSchema.parse(...)` throws a `ZodError`, not a `ValidationError`. Your `errorMapper` catches it as a generic 500 unless you handle it specifically.

`validate({...})` solves both — it routes through `@hono/zod-validator` (which flows types into RPC) and throws `ValidationError` (which `errorMapper` knows about).

## Summary

- `validate({ body, query, param })` returns a tuple of middlewares; spread it into a route.
- Validates with Zod, preserves Hono RPC types, throws `ValidationError` on failure.
- `c.req.valid('json' | 'query' | 'param')` is typed as the Zod input.
- Errors land in `errorMapper` and render as 400 with structured `issues`.
- Validation is shape/type only; business rules and authorization belong in services.
