import { problemSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { noDbDeps } from './helpers/app.ts';

describe('Accept negotiation (406)', () => {
  const app = buildApp(noDbDeps());

  beforeAll(() => app.ready());
  afterAll(() => app.close());

  function get(url: string, accept?: string) {
    return app.inject({
      method: 'GET',
      url,
      headers: accept === undefined ? {} : { accept },
    });
  }

  it.each([
    ['application/xml'],
    ['text/html'],
    ['application/json;q=0'],
    ['application/xml, application/json; q=0.0'],
  ])('returns 406 Problem Details for Accept: %s', async (accept) => {
    const res = await get('/api/health', accept);

    expect(res.statusCode).toBe(406);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemSchema.parse(res.json()).status).toBe(406);
  });

  it.each([
    [undefined],
    [''],
    ['*/*'],
    ['application/*'],
    ['application/json'],
    ['Application/JSON; charset=utf-8'],
    ['application/problem+json'],
    ['application/xml, application/json;q=0.5'],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
  ])('accepts Accept: %s', async (accept) => {
    expect((await get('/api/health', accept)).statusCode).toBe(200);
  });

  it('negotiates unknown /api routes too', async () => {
    expect((await get('/api/unknown', 'application/xml')).statusCode).toBe(406);
  });

  it.each([
    ['/', 'text/html'],
    ['/api/stream', 'text/event-stream'],
  ])('leaves %s to its own handler', async (url, accept) => {
    expect((await get(url, accept)).statusCode).toBe(404);
  });
});
