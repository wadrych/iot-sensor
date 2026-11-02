import { isNull, type SQL, eq, and, max, asc, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { measurements, sensors } from '../../db/schema.ts';

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

function selectActiveSensors(db: Db, filter?: SQL) {
  return db
    .select({
      id: sensors.id,
      name: sensors.name,
      seriesId: sensors.seriesId,
      createdAt: sensors.createdAt,
      lastMeasurementAt: max(measurements.timestamp),
    })
    .from(sensors)
    .leftJoin(measurements, eq(measurements.sensorId, sensors.id))
    .where(and(isNull(sensors.revokedAt), filter))
    .groupBy(sensors.id);
}

export function listSensors(db: Db) {
  return selectActiveSensors(db).orderBy(asc(sensors.id));
}

export async function findSensor(db: Db, id: number) {
  const [row] = await selectActiveSensors(db, eq(sensors.id, id));
  return row;
}

export async function revokeSensor(db: Db, id: number): Promise<boolean> {
  const revoked = await db
    .update(sensors)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sensors.id, id), isNull(sensors.revokedAt)))
    .returning({ id: sensors.id });
  return revoked.length > 0;
}
