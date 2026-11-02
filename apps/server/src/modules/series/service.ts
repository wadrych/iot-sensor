import type { Series, FieldError, SeriesInput } from '@iot-sensor/shared';
import type { Db } from '../../db/client.ts';
import { isUniqueViolation } from '../../db/errors.ts';
import { POINT_STYLES } from '../../db/schema.ts';
import {
  findSeries,
  listSeries,
  insertSeries,
  hasMeasurmentOutside,
  lockSeries,
  updateSeries,
  deleteSeries,
  type NewSeries,
} from './repository.ts';
import { HttpError } from '../../http-error.ts';

export function getAllSeries(db: Db): Promise<Series[]> {
  return listSeries(db);
}

export async function getSeries(db: Db, id: number): Promise<Series> {
  const row = await findSeries(db, id);
  if (!row) {
    throw new HttpError(404, 'Series not found');
  }
  return row;
}

function checkSeriesRules(input: SeriesInput): NewSeries {
  const errors: FieldError[] = [];
  if (input.minValue >= input.maxValue) {
    errors.push({
      field: 'minValue',
      message: 'Min value must be less than max value',
    });
  }
  const icon = input.icon ?? null;
  if (icon !== null && !(POINT_STYLES as readonly string[]).includes(icon)) {
    errors.push({
      field: 'icon',
      message: `Must be one of: ${POINT_STYLES.join(', ')}`,
    });
  }
  if (errors.length > 0) {
    throw new HttpError(422, 'Series rules violated', errors);
  }
  return {
    name: input.name,
    minValue: input.minValue,
    maxValue: input.maxValue,
    color: input.color,
    icon,
    unit: input.unit ?? null,
  };
}

function duplicateName(): HttpError {
  return new HttpError(422, 'Series with this name already exists', [
    { field: 'name', message: 'Series with this name already exists' },
  ]);
}

export async function createSeries(
  db: Db,
  input: SeriesInput,
): Promise<Series> {
  const values = checkSeriesRules(input);
  try {
    const row = await insertSeries(db, values);
    if (!row) throw new Error('Insert failed');
    return row;
  } catch (error) {
    if (isUniqueViolation(error, 'series_name_unique')) {
      throw duplicateName();
    }
    throw error;
  }
}

export async function replaceSeries(
  db: Db,
  id: number,
  input: SeriesInput,
): Promise<Series> {
  const values = checkSeriesRules(input);
  try {
    return await db.transaction(async (tx) => {
      if (!(await lockSeries(tx, id))) {
        throw new HttpError(404, 'Series not found');
      }
      if (
        await hasMeasurmentOutside(tx, id, values.minValue, values.maxValue)
      ) {
        throw new HttpError(
          409,
          'Series has measurements outside the specified range',
        );
      }
      const row = await updateSeries(tx, id, values);
      if (!row) throw new Error('Update failed');
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error, 'series_name_unique')) {
      throw duplicateName();
    }
    throw error;
  }
}

export async function removeSeries(db: Db, id: number): Promise<void> {
  if (!(await deleteSeries(db, id))) {
    throw new HttpError(404, 'Series not found');
  }
}
