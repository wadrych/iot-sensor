import type { Queryable } from '../../db/client.ts';
import { measurements, series } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface NewMeasurement {
  seriesId: number;
  sensorId: number;
  value: number;
  timestamp: Date;
}

export async function lockSeriesRange(tx: Queryable, seriesId: number) {
  const [row] = await tx
    .select({ minValue: series.minValue, maxValue: series.maxValue })
    .from(series)
    .where(eq(series.id, seriesId))
    .for('share');
  return row;
}

export async function insertMeasurement(tx: Queryable, values: NewMeasurement) {
  const [row] = await tx.insert(measurements).values(values).returning({
    id: measurements.id,
    seriesId: measurements.seriesId,
    sensorId: measurements.sensorId,
    value: measurements.value,
    timestamp: measurements.timestamp,
  });
  return row;
}
