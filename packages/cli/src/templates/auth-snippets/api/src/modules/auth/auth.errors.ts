import { AppError } from '@katajs/core';

export class UnauthorizedError extends AppError {
  override readonly status = 401;
  override readonly code = 'unauthorized';
  override readonly publicMessage = 'Authentication required';
  constructor() {
    super('Unauthorized');
  }
}
