import { loginResponseSchema, problemSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { sessions } from '../src/db/schema.ts';
import { seedAdmin } from '../src/db/seed.ts';
import { hashToken } from '../src/modules/auth/tokens.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const ADMIN = { username: 'admin', password: 'temporary-long-password' };

describe('POST /api/auth/login', () => {
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

  function login(body: unknown) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: body as object,
    });
  }

  it('returns a Bearer token and stores only its hash', async () => {
    const res = await login(ADMIN);

    expect(res.statusCode).toBe(200);
    const body = loginResponseSchema.parse(res.json());
    expect(body.tokenType).toBe('Bearer');
    expect(body.expiresIn).toBeGreaterThan(0);

    const rows = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(body.accessToken)));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(body.accessToken);
  });

  it('sets the same token as an HttpOnly, Secure, SameSite=Strict cookie', async () => {
    const res = await login(ADMIN);
    const { accessToken, expiresIn } = loginResponseSchema.parse(res.json());

    const cookie = res.cookies.find((c) => c.name === 'session');
    expect(cookie).toMatchObject({
      value: accessToken,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/api',
      maxAge: expiresIn,
    });
  });

  it('never returns the password or its hash', async () => {
    const res = await login(ADMIN);
    expect(res.body).not.toContain(ADMIN.password);
    expect(res.body).not.toMatch(/password|hash/i);
  });

  it.each([
    [
      'wrong password',
      { username: ADMIN.username, password: 'wrong-password' },
    ],
    ['unknown user', { username: 'nobody', password: ADMIN.password }],
  ])('rejects %s with 401 Problem Details and no cookie', async (_, body) => {
    const res = await login(body);

    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemSchema.parse(res.json()).detail).toBe(
      'Invalid username or password',
    );
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a body without a password with 400', async () => {
    const res = await login({ username: ADMIN.username });
    expect(res.statusCode).toBe(400);
    expect(problemSchema.parse(res.json()).errors?.map((e) => e.field)).toEqual(
      ['password'],
    );
  });
});
