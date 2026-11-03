import type { Measurement, MeasurementInput } from '@iot-sensor/shared';
import type { SensorContext } from '../sensors/authenticate.ts';
import type { Db } from '../../db/client.ts';
import { HttpError } from '../../http-error.ts';
import {
  findMeasurement,
  insertMeasurement,
  listMeasurements,
  lockSeriesRange,
  type MeasurementFilter,
} from './repository.ts';

export const MAX_FUTURE_MS = 5 * 60 * 1000;

interface MeasurementRow {
  id: number;
  seriesId: number;
  sensorId: number;
  value: number;
  timestamp: Date;
}

function toMeasurement(row: MeasurementRow): Measurement {
  return { ...row, timestamp: row.timestamp.toISOString() };
}

export async function recordMeasurement(
  db: Db,
  sensor: SensorContext,
  input: MeasurementInput,
): Promise<Measurement> {
  const now = new Date();
  const timestamp =
    input.timestamp === undefined ? new Date(now) : new Date(input.timestamp);
  if (timestamp.getTime() > now.getTime() + MAX_FUTURE_MS) {
    throw new HttpError(422, 'Timestamp is too far in the future', [
      {
        field: 'timestamp',
        message: 'Timestamp cannot be more than 5 minutes in the future',
      },
    ]);
  }
  const row = await db.transaction(async (tx) => {
    const range = await lockSeriesRange(tx, sensor.seriesId);
    if (!range) {
      throw new HttpError(401, 'Invalid or revoked API key');
    }
    if (input.value < range.minValue || input.value > range.maxValue) {
      const allowed = `[${String(range.minValue)}, ${String(range.maxValue)}]`;
      throw new HttpError(
        422,
        `Value ${String(input.value)} is out of allowed range ${allowed}`,
        [{ field: 'value', message: `Value must be within ${allowed}` }],
      );
    }
    return insertMeasurement(tx, {
      ...sensor,
      value: input.value,
      timestamp,
    });
  });
  if (!row) throw new Error('Insert Failed');
  return toMeasurement(row);
}

export async function getMeasurements(
  db: Db,
  filter: MeasurementFilter,
): Promise<Measurement[]> {
  const rows = await listMeasurements(db, filter);
  return rows.map(toMeasurement);
}

export async function getMeasurement(db: Db, id: number): Promise<Measurement> {
  const row = await findMeasurement(db, id);
  if (!row) {
    throw new HttpError(404, 'Measurement not found');
  }
  return toMeasurement(row);
}
