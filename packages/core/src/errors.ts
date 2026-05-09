import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorContext = {
  c: Context;
  requestId: string;
};

/**
 * Base class for every domain error in user code.
 *
 * - `super(message)` is the *internal* message — for logs and stack traces.
 * - `publicMessage` is what the client sees.
 * - `publicPayload` is optional structured data merged into the response body.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  abstract readonly publicMessage: string;

  /**
   * Optional structured payload merged into the response body. Subclasses may
   * override as either a property or a getter.
   */
  get publicPayload(): Record<string, unknown> | undefined {
    return undefined;
  }

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export type ValidationIssue = {
  path: (string | number)[];
  message: string;
};

export class ValidationError extends AppError {
  override readonly status = 400;
  override readonly code = 'validation_failed';
  override readonly publicMessage = 'Request validation failed';

  constructor(public readonly issues: ValidationIssue[]) {
    super(`Validation failed: ${issues.length} issue(s)`);
  }

  override get publicPayload(): Record<string, unknown> {
    return { issues: this.issues };
  }
}

export type ErrorMapperOptions = {
  /** Hook invoked for unhandled (non-AppError) errors. Use to log to Sentry, etc. */
  onUnhandled?: (err: unknown, ctx: ErrorContext) => void;
};

export type ErrorMapperHandler = (err: Error, c: Context) => Response | Promise<Response>;

/**
 * Build a Hono `onError` handler that renders thrown errors as JSON.
 *
 * - `AppError` subclasses → `{error, message, ...publicPayload, requestId}` at the error's status.
 * - Other errors → safe 500 with `requestId`; `onUnhandled` invoked with the original error.
 *
 * Wired automatically by `createApp` via `app.onError(errorMapper(opts))`.
 */
export function errorMapper(opts: ErrorMapperOptions = {}): ErrorMapperHandler {
  return (err, c) => {
    const requestId =
      c.get('requestId') ?? c.req.header('X-Request-Id') ?? 'unknown';

    if (err instanceof AppError) {
      return c.json(
        {
          error: err.code,
          message: err.publicMessage,
          ...(err.publicPayload ?? {}),
          requestId,
        },
        err.status as ContentfulStatusCode,
      );
    }

    opts.onUnhandled?.(err, { c, requestId });

    return c.json(
      {
        error: 'internal_error',
        message: 'Something went wrong. Please try again.',
        requestId,
      },
      500,
    );
  };
}
