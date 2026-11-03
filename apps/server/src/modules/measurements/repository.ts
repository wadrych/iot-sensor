import type { Queryable } from '../../db/client.ts';
import { measurements, series } from '../../db/schema.ts';
import { eq, inArray, and, gte, lte, desc, asc } from 'drizzle-orm';

export interface NewMeasurement {
  seriesId: number;
  sensorId: number;
  value: number;
  timestamp: Date;
}

export interface MeasurementFilter {
  seriesIds: number[] | undefined;
  from: Date | undefined;
  to: Date | undefined;
  descending: boolean;
  limit: number;
}

const measurementColumns = {
  id: measurements.id,
  seriesId: measurements.seriesId,
  sensorId: measurements.sensorId,
  value: measurements.value,
  timestamp: measurements.timestamp,
};

export async function lockSeriesRange(tx: Queryable, seriesId: number) {
  const [row] = await tx
    .select({ minValue: series.minValue, maxValue: series.maxValue })
    .from(series)
    .where(eq(series.id, seriesId))
    .for('share');
  return row;
}

export async function insertMeasurement(tx: Queryable, values: NewMeasurement) {
  const [row] = await tx
    .insert(measurements)
    .values(values)
    .returning(measurementColumns);
  return row;
}

export async function listMeasurements(
  db: Queryable,
  filter: MeasurementFilter,
) {
  const order = filter.descending ? desc : asc;
  return db
    .select(measurementColumns)
    .from(measurements)
    .where(
      and(
        filter.seriesIds === undefined
          ? undefined
          : inArray(measurements.seriesId, filter.seriesIds),
        filter.from === undefined
          ? undefined
          : gte(measurements.timestamp, filter.from),
        filter.to === undefined
          ? undefined
          : lte(measurements.timestamp, filter.to),
      ),
    )
    .orderBy(order(measurements.timestamp), order(measurements.id))
    .limit(filter.limit);
}
