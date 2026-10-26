import { buildApp } from '../src/app.ts';
import { afterAll, expect, it } from 'vitest';

const app = buildApp();
afterAll(() => app.close());
it('returns 200 and {"status":"ok"}', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
});
