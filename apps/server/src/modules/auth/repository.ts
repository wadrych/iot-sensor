import { eq, and, gt, sql, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { sessions, users } from '../../db/schema.ts';

export async function findUserByUsername(db: Db, username: string) {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return user;
}

export async function createSession(
  db: Db,
  session: { userId: number; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(sessions).values(session);
}

export async function findActiveSession(db: Db, tokenHash: string) {
  const [session] = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return session;
}

export async function deleteSession(db: Db, sessionId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function findPasswordHash(db: Db, userId: number) {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.passwordHash;
}

export async function updatePasswordAndRevokeOtherSessions(
  db: Db,
  userId: number,
  passwordHash: string,
  keepSessionId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
  });
}
