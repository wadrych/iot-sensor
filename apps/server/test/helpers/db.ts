import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createDb, type Db } from '../../src/db/client.ts';

const migrationsFolder = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

export interface TestDb {
  db: Db;
  pool: pg.Pool;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18',
  ).start();
  const { db, pool } = createDb(container.getConnectionUri());
  await migrate(db, { migrationsFolder });
  return {
    db,
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
