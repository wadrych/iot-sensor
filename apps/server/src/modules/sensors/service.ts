import type { Sensor, SensorCreated, SensorInput } from '@iot-sensor/shared';
import type { Db } from '../../db/client.ts';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors.ts';
import { HttpError } from '../../http-error.ts';
import { findSensor, insertSensor, listSensors } from './repository.ts';
import { hashToken } from '../auth/tokens.ts';
import { generateApiKey } from './api-key.ts';
import { MAX_DB_INTEGER } from '../../path-id.ts';

function seriesNotFound(): HttpError {
  return new HttpError(422, 'Series does not exist', [
    { field: 'seriesId', message: 'Series with this id does not exist' },
  ]);
}

export async function registerSensor(
  db: Db,
  input: SensorInput,
): Promise<SensorCreated> {
  if (input.seriesId > MAX_DB_INTEGER) throw seriesNotFound();

  const apiKey = generateApiKey();
  try {
    const row = await insertSensor(db, {
      name: input.name,
      seriesId: input.seriesId,
      keyHash: hashToken(apiKey),
    });
    if (!row) throw new Error('Insert failed');
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastMeasurementAt: null,
      apiKey,
    };
  } catch (error) {
    if (isForeignKeyViolation(error, 'sensors_series_id_series_id_fk')) {
      throw seriesNotFound();
    }
    if (isUniqueViolation(error, 'sensors_active_name_unique')) {
      throw new HttpError(422, 'Sensor with this name already exists', [
        { field: 'name', message: 'Sensor with this name already exists' },
      ]);
    }
    throw error;
  }
}

interface SensorRow {
  id: number;
  name: string;
  seriesId: number;
  createdAt: Date;
  lastMeasurementAt: Date | null;
}

function toSensor(row: SensorRow): Sensor {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastMeasurementAt: row.lastMeasurementAt?.toISOString() ?? null,
  };
}

export async function getAllSensors(db: Db): Promise<Sensor[]> {
  const rows = await listSensors(db);
  return rows.map(toSensor);
}

export async function getSensor(db: Db, id: number): Promise<Sensor> {
  const row = await findSensor(db, id);
  if (!row) throw new HttpError(404, 'Sensor not found');
  return toSensor(row);
}
