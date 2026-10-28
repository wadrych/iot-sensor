import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
  });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
