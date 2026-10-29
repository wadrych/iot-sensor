import type { Db } from '../../db/client.ts';
import { HttpError } from '../../http-error.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { createSession, findUserByUsername } from './repository.ts';
import { generateSessionToken, hashToken } from './tokens.ts';

export const SESSION_TTL_SECONDS = 60 * 60 * 8;

const dummyHash = hashPassword(
  'test-string-test-string-test-string-test-string',
);

export async function login(
  db: Db,
  username: string,
  password: string,
): Promise<{ token: string; expiresIn: number }> {
  const user = await findUserByUsername(db, username);
  const passwordOk = await verifyPassword(
    user?.passwordHash ?? (await dummyHash),
    password,
  );

  if (!user || !passwordOk) {
    throw new HttpError(401, 'Invalid username or password');
  }

  const token = generateSessionToken();
  await createSession(db, {
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return { token, expiresIn: SESSION_TTL_SECONDS };
}
