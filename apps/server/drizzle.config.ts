import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';
import { loadConfig } from './src/config.ts';

const envFile = '../../.env';

if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: loadConfig().DATABASE_URL },
});
