import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { AppError, ValidationError, errorMapper } from '../src/errors';

class PostNotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = 'post_not_found';
  override readonly publicMessage = 'Post not found';
  constructor(public readonly postId: string) {
    super(`Post ${postId} not found`);
  }
  override get publicPayload() {
    return { postId: this.postId };
  }
}

function buildApp(opts?: Parameters<typeof errorMapper>[0]) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'req_test');
    c.header('X-Request-Id', 'req_test');
    await next();
  });
  app.onError(errorMapper(opts));
  return app;
}

describe('errorMapper', () => {
  it('renders an AppError with status, code, message, payload, and requestId', async () => {
    const app = buildApp();
    app.get('/missing', () => {
      throw new PostNotFoundError('abc');
    });

    const res = await app.request('/missing');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: 'post_not_found',
      message: 'Post not found',
      postId: 'abc',
      requestId: 'req_test',
    });
  });

  it('renders a ValidationError with issues array', async () => {
    const app = buildApp();
    app.get('/bad', () => {
      throw new ValidationError([
        { path: ['body', 'title'], message: 'Required' },
        { path: ['body', 'password'], message: 'Too short' },
      ]);
    });

    const res = await app.request('/bad');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: 'validation_failed',
      message: 'Request validation failed',
      issues: [
        { path: ['body', 'title'], message: 'Required' },
        { path: ['body', 'password'], message: 'Too short' },
      ],
      requestId: 'req_test',
    });
  });

  it('masks unhandled errors as 500 and invokes onUnhandled with the original error', async () => {
    const onUnhandled = vi.fn();
    const app = buildApp({ onUnhandled });
    const boom = new Error('database exploded');
    app.get('/oops', () => {
      throw boom;
    });

    const res = await app.request('/oops');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: 'internal_error',
      message: 'Something went wrong. Please try again.',
      requestId: 'req_test',
    });
    expect(onUnhandled).toHaveBeenCalledTimes(1);
    expect(onUnhandled.mock.calls[0]?.[0]).toBe(boom);
    expect(onUnhandled.mock.calls[0]?.[1]).toMatchObject({ requestId: 'req_test' });
  });

  it('includes requestId from header when not set on context', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.get('/oops', () => {
      throw new PostNotFoundError('xyz');
    });

    const res = await app.request('/oops', {
      headers: { 'X-Request-Id': 'header-req' },
    });
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe('header-req');
  });

  it('falls back to "unknown" requestId when none is set', async () => {
    const app = new Hono();
    app.onError(errorMapper());
    app.get('/oops', () => {
      throw new PostNotFoundError('xyz');
    });

    const res = await app.request('/oops');
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe('unknown');
  });
});

describe('AppError shape', () => {
  it('preserves the internal message for logs and the public message for clients', () => {
    const e = new PostNotFoundError('123');
    expect(e.message).toBe('Post 123 not found');
    expect(e.publicMessage).toBe('Post not found');
    expect(e.code).toBe('post_not_found');
    expect(e.status).toBe(404);
    expect(e.name).toBe('PostNotFoundError');
  });

  it('ValidationError counts issues in its internal message', () => {
    const e = new ValidationError([
      { path: ['body'], message: 'a' },
      { path: ['query'], message: 'b' },
    ]);
    expect(e.message).toBe('Validation failed: 2 issue(s)');
    expect(e.publicPayload).toEqual({
      issues: [
        { path: ['body'], message: 'a' },
        { path: ['query'], message: 'b' },
      ],
    });
  });
});
