import { problemSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.ts';
import { HttpError } from '../src/http-error.ts';

describe('Problem Details error handling', () => {
  const app = buildApp();

  beforeAll(async () => {
    app.get('/test/http-error', () => {
      throw new HttpError(422, 'Value out of range', [
        { field: 'value', message: 'Value must be <=100' },
      ]);
    });
    app.post(
      '/test/validated',
      { schema: { body: z.object({ name: z.string().min(1) }) } },
      () => ({ ok: true }),
    );
    app.get('/test/crash', () => {
      throw new Error('connect to internal-db-host failed');
    });
    app.get(
      '/test/bad-response',
      { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
      () => ({ ok: 'yes' }) as never,
    );
    await app.ready();
  });

  afterAll(() => app.close());

  function expectProblem(
    res: { statusCode: number; headers: Record<string, unknown>; body: string },
    status: number,
  ) {
    expect(res.statusCode).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const problem = problemSchema.parse(JSON.parse(res.body));
    expect(problem.status).toBe(status);
    return problem;
  }

  it('maps HttpError to its status,detail and field errors', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/http-error',
    });
    const problem = expectProblem(res, 422);
    expect(problem).toMatchObject({
      type: 'about:blank',
      title: 'Unprocessable Entity',
      detail: 'Value out of range',
      errors: [{ field: 'value', message: 'Value must be <=100' }],
    });
  });

  it('returns 400 with field errors when the body fails schema validation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/validated',
      payload: { name: '' },
    });
    const problem = expectProblem(res, 400);
    expect(problem.errors?.map((e) => e.field)).toEqual(['name']);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/validated',
      headers: { 'content-type': 'application/json' },
      payload: '{name: }',
    });
    expectProblem(res, 400);
  });

  it('returns 404 for uknonw route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/unknown-route',
    });
    expectProblem(res, 404);
  });

  it('hides unexpected errors behind a generic 500 without stating internal details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/crash',
    });
    const problem = expectProblem(res, 500);
    expect(problem.title).toBe('Internal Server Error');
    expect(res.body).not.toContain('internal-db-host');
    expect(res.body).not.toContain('stack');
  });

  it('treats a response that breaks its schema as a 500 error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/bad-response',
    });
    expectProblem(res, 500);
  });
});
