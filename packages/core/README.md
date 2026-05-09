# @katajs/core

The runtime for [katajs](https://github.com/ookino/katajs) — an opinionated framework for [Hono](https://hono.dev) on [Cloudflare Workers](https://developers.cloudflare.com/workers/).

```bash
pnpm add @katajs/core hono zod @hono/zod-validator
```

## What you get

- `defineModule` — declare a unit of code (provides + requires + routes)
- `createApp` — boot a Hono app from a list of modules with validated dependencies
- Per-request DI container with lazy resolution and cycle detection
- `AppError` + `errorMapper` — typed domain errors → HTTP responses
- `validate({ body, query, param })` — Zod validation that preserves Hono RPC types
- `inspectModules` — static graph inspection (Mermaid + HTML)
- `@katajs/core/testing` — `makeTestContainer` for unit tests

## A minimal example

```ts
import { Hono } from 'hono';
import { createApp, defineModule, validate } from '@katajs/core';
import { z } from 'zod';

// 1. Declare a module
const greetingModule = defineModule({
  name: 'greeting',
  provides: {
    greeter: () => ({ greet: (name: string) => `hello, ${name}` }),
  },
  requires: [] as const,
  routes: new Hono().get(
    '/:name',
    ...validate({ param: z.object({ name: z.string() }) }),
    (c) => {
      const { name } = c.req.valid('param');
      return c.json({ msg: c.var.resolve('greeter').greet(name) });
    },
  ),
  prefix: '/hello',
});

// 2. Tell the Registry about it (in src/types.d.ts)
declare module '@katajs/core' {
  interface Registry {
    greeter: { greet: (name: string) => string };
  }
}

// 3. Boot the app
const { app } = createApp({
  bindings: {} as { /* your Cloudflare bindings */ },
  modules: [greetingModule],
  routes: (base) => base.route(greetingModule.prefix, greetingModule.routes),
});

export default app;
export type AppType = typeof app;
```

## Public API

```ts
// Modules
export { defineModule } from '@katajs/core';
export type { Module, RoutedModule, ServiceOnlyModule } from '@katajs/core';

// App
export { createApp } from '@katajs/core';
export type { AppConfig, BaseApp } from '@katajs/core';

// Middleware
export { defineMiddleware } from '@katajs/core';
export type { DbAdapter, RequestVariables } from '@katajs/core';

// Errors
export { AppError, ValidationError, errorMapper } from '@katajs/core';

// Validation
export { validate } from '@katajs/core';

// Devtools
export { inspectModules } from '@katajs/core';

// Augmentable interfaces
export type { Registry, AppEnv, AppDb, RegistryKey } from '@katajs/core';

// Testing helpers
export { makeTestContainer } from '@katajs/core/testing';
```

## Documentation

- [Concepts: intro](https://github.com/ookino/katajs/blob/main/docs/concepts/intro.md)
- [Concepts: modules](https://github.com/ookino/katajs/blob/main/docs/concepts/modules.md)
- [Concepts: container](https://github.com/ookino/katajs/blob/main/docs/concepts/container.md)
- [Concepts: registry](https://github.com/ookino/katajs/blob/main/docs/concepts/registry.md)
- [Concepts: routes](https://github.com/ookino/katajs/blob/main/docs/concepts/routes.md)
- [Concepts: validation](https://github.com/ookino/katajs/blob/main/docs/concepts/validation.md)
- [Concepts: errors](https://github.com/ookino/katajs/blob/main/docs/concepts/errors.md)
- [Concepts: transactions](https://github.com/ookino/katajs/blob/main/docs/concepts/transactions.md)
- [Concepts: testing](https://github.com/ookino/katajs/blob/main/docs/concepts/testing.md)
- [Concepts: devtools](https://github.com/ookino/katajs/blob/main/docs/concepts/devtools.md)
- [Concepts: architecture](https://github.com/ookino/katajs/blob/main/docs/concepts/architecture.md)
- [Showcase example](https://github.com/ookino/katajs/tree/main/examples/showcase)

## License

[MIT](./LICENSE) © Yaseer A. Okino
