import { loginResponseSchema, problemSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { sessions } from '../src/db/schema.ts';
import { seedAdmin } from '../src/db/seed.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const ADMIN = { username: 'admin', password: 'correct-horse-battery' };

describe('POST /api/auth/logout', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    t = await startTestDb();
    await seedAdmin(t.db, ADMIN);
    app = buildApp({ db: t.db });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  async function loginToken(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: ADMIN,
    });
    return loginResponseSchema.parse(res.json()).accessToken;
  }

  function logout(token?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });
  }

  function sessionStatus(token: string) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it('returns 204 and the token stops working', async () => {
    const token = await loginToken();

    const res = await logout(token);

    expect(res.statusCode).toBe(204);
    expect((await sessionStatus(token)).statusCode).toBe(401);
  });

  it('deletes the session row and clears the cookie', async () => {
    const token = await loginToken();
    const before = await t.db.select().from(sessions);

    const res = await logout(token);

    const after = await t.db.select().from(sessions);
    expect(after).toHaveLength(before.length - 1);
    const cookie = res.cookies.find((c) => c.name === 'session');
    expect(cookie).toMatchObject({ value: '', path: '/api', maxAge: 0 });
  });

  it('ends only the current session', async () => {
    const first = await loginToken();
    const second = await loginToken();

    await logout(first);

    expect((await sessionStatus(second)).statusCode).toBe(204);
  });

  it('returns 401 without a token', async () => {
    const res = await logout();
    expect(res.statusCode).toBe(401);
    expect(problemSchema.parse(res.json()).status).toBe(401);
  });
});
