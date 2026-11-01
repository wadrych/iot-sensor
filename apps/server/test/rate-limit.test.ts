import { problemSchema } from '@iot-sensor/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { LOGIN_RATE_LIMIT } from '../src/modules/auth/routes.ts';
import { noDbDeps } from './helpers/app.ts';

describe('login rate limit', () => {
  const app = buildApp(noDbDeps());
  afterAll(() => app.close());

  // An invalid body is rejected with 400 before any database access,
  // but still counts towards the limit
  function attempt() {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });
  }

  it('returns 429 Problem Details after too many attempts', async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
      expect((await attempt()).statusCode).toBe(400);
    }

    const res = await attempt();

    expect(res.statusCode).toBe(429);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemSchema.parse(res.json()).status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('does not limit other routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });
});
