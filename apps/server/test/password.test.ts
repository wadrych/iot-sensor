import { loginResponseSchema, problemSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { users } from '../src/db/schema.ts';
import { seedAdmin } from '../src/db/seed.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const ADMIN = { username: 'admin', password: 'correct-horse-battery' };
const NEW_PASSWORD = 'new-staple-battery';

describe('PUT /api/auth/password', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    t = await startTestDb();
    app = buildApp({ db: t.db });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  // Every test starts from a fresh admin; deleting users also deletes their sessions
  beforeEach(async () => {
    await t.db.delete(users);
    await seedAdmin(t.db, ADMIN);
  });

  function login(password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: ADMIN.username, password },
    });
  }

  async function loginToken(): Promise<string> {
    return loginResponseSchema.parse((await login(ADMIN.password)).json())
      .accessToken;
  }

  function changePassword(token: string | undefined, body: object) {
    return app.inject({
      method: 'PUT',
      url: '/api/auth/password',
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  function sessionStatus(token: string) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it('returns 204 and only the new password works afterwards', async () => {
    const token = await loginToken();

    const res = await changePassword(token, {
      currentPassword: ADMIN.password,
      newPassword: NEW_PASSWORD,
    });

    expect(res.statusCode).toBe(204);
    expect((await login(ADMIN.password)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('revokes all other sessions but keeps the current one', async () => {
    const current = await loginToken();
    const other = await loginToken();

    await changePassword(current, {
      currentPassword: ADMIN.password,
      newPassword: NEW_PASSWORD,
    });

    expect((await sessionStatus(current)).statusCode).toBe(204);
    expect((await sessionStatus(other)).statusCode).toBe(401);
  });

  it('returns 403 for a wrong current password and keeps the old one', async () => {
    const token = await loginToken();

    const res = await changePassword(token, {
      currentPassword: 'wrong-password',
      newPassword: NEW_PASSWORD,
    });

    expect(res.statusCode).toBe(403);
    expect(problemSchema.parse(res.json()).status).toBe(403);
    expect((await login(ADMIN.password)).statusCode).toBe(200);
  });

  it('returns 422 for a new password shorter than 8 characters', async () => {
    const token = await loginToken();

    const res = await changePassword(token, {
      currentPassword: ADMIN.password,
      newPassword: 'short',
    });

    expect(res.statusCode).toBe(422);
    expect(problemSchema.parse(res.json()).errors?.[0]?.field).toBe(
      'newPassword',
    );
    expect((await login(ADMIN.password)).statusCode).toBe(200);
  });

  it('returns 400 when a field is missing', async () => {
    const token = await loginToken();
    const res = await changePassword(token, {
      currentPassword: ADMIN.password,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without a token, before validating the body', async () => {
    const res = await changePassword(undefined, {});
    expect(res.statusCode).toBe(401);
  });
});
