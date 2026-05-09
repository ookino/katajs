import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { errorMapper } from '../src/errors';
import { validate } from '../src/validate';

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

const PostIdParam = z.object({ id: z.string().uuid() });

const PageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
});

describe('validate', () => {
  it('passes a valid body and exposes c.req.valid("json") to the handler', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.post('/posts', ...validate({ body: CreatePostSchema }), (c) => {
      const data = c.req.valid('json');
      return c.json({ ok: true, echo: data });
    });

    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hi', body: 'Hello world' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      echo: { title: 'Hi', body: 'Hello world' },
    });
  });

  it('throws ValidationError on body failure with body-prefixed paths', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.post('/posts', ...validate({ body: CreatePostSchema }), (c) =>
      c.json({ ok: true }),
    );

    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '', body: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { path: (string | number)[]; message: string }[];
    };
    expect(body.error).toBe('validation_failed');
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      expect(issue.path[0]).toBe('body');
    }
  });

  it('validates query and prefixes the issue path with "query"', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.get('/list', ...validate({ query: PageQuery }), (c) => {
      const q = c.req.valid('query');
      return c.json({ page: q.page });
    });

    const ok = await app.request('/list?page=3');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ page: 3 });

    const bad = await app.request('/list?page=-1');
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as {
      issues: { path: (string | number)[] }[];
    };
    expect(body.issues[0]?.path[0]).toBe('query');
  });

  it('validates path params and prefixes the issue path with "param"', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.get('/posts/:id', ...validate({ param: PostIdParam }), (c) => {
      const p = c.req.valid('param');
      return c.json({ id: p.id });
    });

    const bad = await app.request('/posts/not-a-uuid');
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as {
      issues: { path: (string | number)[] }[];
    };
    expect(body.issues[0]?.path[0]).toBe('param');
  });

  it('composes body + query + param validators together', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.put(
      '/posts/:id',
      ...validate({
        body: CreatePostSchema,
        query: PageQuery,
        param: PostIdParam,
      }),
      (c) => {
        const body = c.req.valid('json');
        const query = c.req.valid('query');
        const param = c.req.valid('param');
        return c.json({ body, query, param });
      },
    );

    const res = await app.request(
      '/posts/00000000-0000-4000-8000-000000000000?page=2',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'T', body: 'B' }),
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      body: { title: 'T', body: 'B' },
      query: { page: 2 },
      param: { id: '00000000-0000-4000-8000-000000000000' },
    });
  });
});
