import type { FieldError, Problem } from '@iot-sensor/shared';
import type { FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { STATUS_CODES } from 'node:http';
import type { App } from '../app.ts';
import { HttpError } from '../http-error.ts';

function sendProblem(
  reply: FastifyReply,
  status: number,
  details?: string,
  errors?: FieldError[],
) {
  const problem: Problem = {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
  };
  if (details !== undefined) problem.detail = details;
  if (errors !== undefined) problem.errors = errors;
  return reply.code(status).type('application/problem+json').send(problem);
}

export function problemDetails(app: App): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return sendProblem(reply, error.statusCode, error.message, error.errors);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = error.validation.map((issue) => ({
        field:
          issue.instancePath.slice(1).replaceAll('/', '.') ||
          (error.validationContext ?? 'request'),
        message: issue.message ?? 'Invalid value',
      }));
      return sendProblem(reply, 400, 'Request validation failed', errors);
    }

    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    if (status >= 400 && status < 500) {
      const detail = error instanceof Error ? error.message : undefined;
      return sendProblem(reply, status, detail);
    }

    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(reply, 500);
  });

  app.setNotFoundHandler((request, reply) => {
    return sendProblem(
      reply,
      404,
      `No route for ${request.method} ${request.url}`,
    );
  });
}
