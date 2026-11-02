import type { Db } from '../../db/client.ts';
import { sensors } from '../../db/schema.ts';

export async function insertSensor(
  db: Db,
  values: { name: string; seriesId: number; keyHash: string },
) {
  const [row] = await db.insert(sensors).values(values).returning({
    id: sensors.id,
    name: sensors.name,
    seriesId: sensors.seriesId,
    createdAt: sensors.createdAt,
  });
  return row;
}
