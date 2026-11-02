import type { SensorCreated, SensorInput } from '@iot-sensor/shared';
import type { Db } from '../../db/client.ts';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors.ts';
import { HttpError } from '../../http-error.ts';
import { insertSensor } from './repository.ts';
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
