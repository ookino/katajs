import { zValidator } from '@hono/zod-validator';
import type { Context, MiddlewareHandler } from 'hono';
import type { ZodSchema } from 'zod';
import { ValidationError } from './errors';

type Source = 'body' | 'query' | 'param';

const targetByLabel: Record<Source, 'json' | 'query' | 'param'> = {
  body: 'json',
  query: 'query',
  param: 'param',
};

/**
 * Common shape of a Zod validation failure across zod 3 and zod 4 (`$ZodError`
 * in v4). Typed structurally so the hook accepts whatever the
 * `@hono/zod-validator` `Hook` discriminated union passes — without pinning a
 * concrete `ZodError` class, which differs between the major versions.
 */
type HookResult = {
  success: boolean;
  error?: {
    issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
  };
};

function makeHook(label: Source) {
  return (result: HookResult, _c: Context) => {
    if (!result.success && result.error) {
      const issues = result.error.issues.map((i) => ({
        path: [label, ...i.path] as (string | number)[],
        message: i.message,
      }));
      throw new ValidationError(issues);
    }
  };
}

type V<
  T extends ZodSchema | undefined,
  Target extends 'json' | 'query' | 'param',
> = T extends ZodSchema
  ? [ReturnType<typeof zValidator<T, Target, any, string>>]
  : [];

/**
 * Validate `body`, `query`, and/or `param` against Zod schemas.
 *
 * Returns a tuple of Hono middlewares that the user spreads into a route.
 * Each middleware preserves Hono RPC's typed surface so `c.req.valid('json' |
 * 'query' | 'param')` is correctly typed in handlers downstream.
 *
 *   app.post('/posts',
 *     ...validate({ body: CreatePostSchema, param: PostIdParam }),
 *     async (c) => {
 *       const body = c.req.valid('json');   // typed as z.infer<typeof CreatePostSchema>
 *       const params = c.req.valid('param'); // typed as z.infer<typeof PostIdParam>
 *     }
 *   );
 *
 * On validation failure, throws a `ValidationError` (rendered as 400 by the
 * `errorMapper` middleware).
 */
export function validate<
  TBody extends ZodSchema | undefined = undefined,
  TQuery extends ZodSchema | undefined = undefined,
  TParam extends ZodSchema | undefined = undefined,
>(opts: {
  body?: TBody;
  query?: TQuery;
  param?: TParam;
}): [...V<TBody, 'json'>, ...V<TQuery, 'query'>, ...V<TParam, 'param'>] {
  const middlewares: MiddlewareHandler[] = [];
  if (opts.body) {
    middlewares.push(zValidator(targetByLabel.body, opts.body, makeHook('body')));
  }
  if (opts.query) {
    middlewares.push(zValidator(targetByLabel.query, opts.query, makeHook('query')));
  }
  if (opts.param) {
    middlewares.push(zValidator(targetByLabel.param, opts.param, makeHook('param')));
  }
  return middlewares as never;
}
