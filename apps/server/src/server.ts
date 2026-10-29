import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const app = buildApp({ db }, { logger: true });
app.addHook('onClose', () => pool.end());

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
