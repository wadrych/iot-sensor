import type { FieldError } from '@iot-sensor/shared';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly errors: FieldError[] | undefined;

  constructor(statusCode: number, detail: string, errors?: FieldError[]) {
    super(detail);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
