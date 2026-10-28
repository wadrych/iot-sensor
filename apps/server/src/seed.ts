import { z } from 'zod';
import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';
import { seedAdmin } from './db/seed.ts';

const adminEnvSchema = z.object({
  ADMIN_USERNAME: z.string().min(1).max(100),
  ADMIN_PASSWORD: z.string().min(8),
});

const config = loadConfig();
const admin = adminEnvSchema.parse(process.env);
const { db, pool } = createDb(config.DATABASE_URL);

try {
  const result = await seedAdmin(db, {
    username: admin.ADMIN_USERNAME,
    password: admin.ADMIN_PASSWORD,
  });
  console.log(
    result === 'created'
      ? `Admin user "${admin.ADMIN_USERNAME}" created`
      : `Users already exist`,
  );
} finally {
  await pool.end();
}
