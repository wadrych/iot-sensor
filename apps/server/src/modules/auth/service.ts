import type { Db } from '../../db/client.ts';
import { HttpError } from '../../http-error.ts';
import { hashPassword, verifyPassword } from './password.ts';
import {
  createSession,
  findUserByUsername,
  deleteSession,
  findPasswordHash,
  updatePasswordAndRevokeOtherSessions,
} from './repository.ts';
import { generateSessionToken, hashToken } from './tokens.ts';
import { NEW_PASSWORD_MIN_LENGTH } from '@iot-sensor/shared';
import type { AuthContext } from './authenticate.ts';

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

export async function logout(db: Db, sessionId: number): Promise<void> {
  await deleteSession(db, sessionId);
}

export async function changePassword(
  db: Db,
  auth: AuthContext,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const passwordHash = await findPasswordHash(db, auth.userId);
  if (
    passwordHash === undefined ||
    !(await verifyPassword(passwordHash, currentPassword))
  ) {
    throw new HttpError(403, 'Current password is incorrect');
  }
  if (newPassword.length < NEW_PASSWORD_MIN_LENGTH) {
    throw new HttpError(422, `New password is too short`, [
      {
        field: 'newPassword',
        message: `New password must be at least ${String(NEW_PASSWORD_MIN_LENGTH)} characters long`,
      },
    ]);
  }

  await updatePasswordAndRevokeOtherSessions(
    db,
    auth.userId,
    await hashPassword(newPassword),
    auth.sessionId,
  );
}
