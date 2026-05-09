import { AppError } from '@katajs/core';

export class {{Pascal}}NotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = '{{snake}}_not_found';
  override readonly publicMessage = '{{Pascal}} not found';

  constructor(public readonly id: string) {
    super(`{{Pascal}} ${id} not found`);
  }

  override get publicPayload() {
    return { id: this.id };
  }
}
