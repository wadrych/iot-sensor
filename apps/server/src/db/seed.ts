import { hashPassword } from '../modules/auth/password.ts';
import type { Db } from './client.ts';
import { users } from './schema.ts';

export interface AdminCredentials {
  username: string;
  password: string;
}

export async function seedAdmin(
  db: Db,
  admin: AdminCredentials,
): Promise<'created' | 'skipped'> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    return 'skipped';
  }

  await db.insert(users).values({
    username: admin.username,
    passwordHash: await hashPassword(admin.password),
  });

  return 'created';
}
