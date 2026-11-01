import type { Series } from '@iot-sensor/shared';
import type { Db } from '../../db/client.ts';
import { findSeries, listSeries } from './repository.ts';
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
