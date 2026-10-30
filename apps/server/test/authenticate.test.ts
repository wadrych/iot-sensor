import { loginResponseSchema, problemSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { sessions, users } from '../src/db/schema.ts';
import { seedAdmin } from '../src/db/seed.ts';
import { getAuth, requireAuth } from '../src/modules/auth/authenticate.ts';
import { generateSessionToken, hashToken } from '../src/modules/auth/tokens.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const ADMIN = { username: 'admin', password: 'correct-horse-battery' };
const HOST = 'app.example';

describe('authentication', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;

  beforeAll(async () => {
    t = await startTestDb();
    await seedAdmin(t.db, ADMIN);
    app = buildApp({ db: t.db });
    // Test-only state-changing route behind the auth check
    app.post(
      '/api/test/protected',
      { preHandler: requireAuth(t.db) },
      (request) => ({ userId: getAuth(request).userId }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: ADMIN,
    });
    token = loginResponseSchema.parse(res.json()).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  function getSession(headers: Record<string, string>, cookies = {}) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers,
      cookies,
    });
  }

  function postProtected(headers: Record<string, string>, cookies = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/test/protected',
      headers: { host: HOST, ...headers },
      cookies,
    });
  }

  function expectProblem(
    res: { statusCode: number; body: string },
    status: number,
  ) {
    expect(res.statusCode).toBe(status);
    expect(problemSchema.parse(JSON.parse(res.body)).status).toBe(status);
  }

  describe('GET /api/auth/session', () => {
    it('returns 204 for a valid Bearer token', async () => {
      const res = await getSession({ authorization: `Bearer ${token}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 204 for a valid session cookie', async () => {
      const res = await getSession({}, { session: token });
      expect(res.statusCode).toBe(204);
    });

    it.each([
      ['no credentials', {}],
      ['a forged token', { authorization: `Bearer ${generateSessionToken()}` }],
      ['a non-Bearer scheme', { authorization: `Basic ${token}` }],
    ])('returns 401 for %s', async (_, headers) => {
      expectProblem(await getSession(headers), 401);
    });

    it('returns 401 for an expired session', async () => {
      const expired = generateSessionToken();
      const [admin] = await t.db.select({ id: users.id }).from(users);
      await t.db.insert(sessions).values({
        userId: admin?.id ?? 0,
        tokenHash: hashToken(expired),
        createdAt: new Date(Date.now() - 2 * 3600_000),
        expiresAt: new Date(Date.now() - 3600_000),
      });

      expectProblem(
        await getSession({ authorization: `Bearer ${expired}` }),
        401,
      );
    });
  });

  describe('CSRF protection for cookie-authenticated writes', () => {
    it('accepts a Bearer token without an Origin header', async () => {
      const res = await postProtected({ authorization: `Bearer ${token}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('userId');
    });

    it('accepts a cookie when Origin matches the host', async () => {
      const res = await postProtected(
        { origin: `https://${HOST}` },
        { session: token },
      );
      expect(res.statusCode).toBe(200);
    });

    it.each([
      ['a foreign Origin', { origin: 'https://evil.example' }],
      ['no Origin', {}],
    ])('rejects a cookie with %s (403)', async (_, headers) => {
      expectProblem(await postProtected(headers, { session: token }), 403);
    });
  });
});
