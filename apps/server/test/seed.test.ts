import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.ts';
import { seedAdmin } from '../src/db/seed.ts';
import { verifyPassword } from '../src/modules/auth/password.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

describe('seedAdmin', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await startTestDb();
  }, 120_000);

  afterAll(() => t.stop());

  beforeEach(async () => {
    await t.db.delete(users);
  });

  it('should cread the admin with an Argon2id when no users exits', async () => {
    const result = await seedAdmin(t.db, {
      username: 'admin',
      password: 'xyzabc',
    });
    expect(result).toBe('created');
    const rows = await t.db.select().from(users);
    expect(rows).toHaveLength(1);
    const [admin] = rows;
    expect(admin?.username).toBe('admin');
    expect(admin?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(admin?.passwordHash ?? '', 'xyzabc')).toBe(
      true,
    );
  });

  it('nver overwrites an existing user', async () => {
    await seedAdmin(t.db, { username: 'admin', password: 'first-password' });
    const [before] = await t.db.select().from(users);

    const result = await seedAdmin(t.db, {
      username: 'admin',
      password: 'second-password',
    });

    expect(result).toBe('skipped');
    const rows = await t.db.select().from(users);
    expect(rows).toEqual([before]);
  });
});
