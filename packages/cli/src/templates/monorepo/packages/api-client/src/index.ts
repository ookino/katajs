/**
 * Typed Hono RPC client factory.
 *
 * Generic over the API's `AppType` so this package has zero workspace deps —
 * it doesn't try to resolve types from `apps/api`, which would force a
 * cross-package typecheck of the entire API source. The consumer provides
 * the type:
 *
 *   import { createApiClient } from '@{{PROJECT_NAME}}/api-client';
 *   import type { AppType } from '@{{PROJECT_NAME}}/api';
 *
 *   const api = createApiClient<AppType>('https://api.example.com');
 *   const res = await api.posts.$post({ json: { title: 't', body: 'b' } });
 *   const data = await res.json();   // typed end-to-end
 *
 * This package is the place to evolve cross-cutting client concerns over time
 * — auth header injection, retry policy, error response parsing, request
 * tracing, mock clients for testing.
 */
import { hc } from 'hono/client';
import type { Hono } from 'hono';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHono = Hono<any, any, any>;

export type ApiClient<App extends AnyHono> = ReturnType<typeof hc<App>>;

export type ApiClientOptions = {
  /** Optional headers merged into every request (e.g. Authorization). */
  headers?: Record<string, string>;
  /** Custom fetch implementation (e.g. for testing). Defaults to global `fetch`. */
  fetch?: typeof fetch;
};

export function createApiClient<App extends AnyHono>(
  baseUrl: string,
  options: ApiClientOptions = {},
): ApiClient<App> {
  return hc<App>(baseUrl, {
    headers: options.headers,
    fetch: options.fetch,
  });
}
