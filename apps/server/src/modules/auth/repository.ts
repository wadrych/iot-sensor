import { eq, and, gt, sql } from 'drizzle-orm';
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
