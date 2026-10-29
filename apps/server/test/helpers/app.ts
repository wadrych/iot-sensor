import type { AppDeps } from '../../src/app.ts';
import { createDb } from '../../src/db/client.ts';

export function noDbDeps(): AppDeps {
  return { db: createDb('postgres://unused@127.0.0.1:1/unused').db };
}
