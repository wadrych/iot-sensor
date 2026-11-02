import { loginResponseSchema } from '@iot-sensor/shared';
import type { App } from '../../src/app.ts';
import type { Db } from '../../src/db/client.ts';
import { seedAdmin } from '../../src/db/seed.ts';

export const TEST_ADMIN = {
  username: 'admin',
  password: 'password',
};

export async function adminToken(app: App, db: Db): Promise<string> {
  await seedAdmin(db, TEST_ADMIN);
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: TEST_ADMIN,
  });
  return loginResponseSchema.parse(res.json()).accessToken;
}
