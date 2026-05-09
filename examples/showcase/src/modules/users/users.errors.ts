import { AppError } from '@katajs/core';

export class UserNotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = 'user_not_found';
  override readonly publicMessage = 'User not found';
  constructor(public readonly userId: string) {
    super(`User ${userId} not found`);
  }
  override get publicPayload() {
    return { userId: this.userId };
  }
}

export class EmailTakenError extends AppError {
  override readonly status = 409;
  override readonly code = 'email_taken';
  override readonly publicMessage = 'Email already in use';
  constructor(public readonly email: string) {
    super(`Email ${email} is already taken`);
  }
}
