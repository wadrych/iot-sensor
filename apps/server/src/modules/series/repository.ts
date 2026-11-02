import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { series } from '../../db/schema.ts';

export interface NewSeries {
  name: string;
  minValue: number;
  maxValue: number;
  color: string;
  icon?: string | null;
  unit?: string | null;
}

const seriesColumns = {
  id: series.id,
  name: series.name,
  minValue: series.minValue,
  maxValue: series.maxValue,
  color: series.color,
  icon: series.icon,
  unit: series.unit,
};

export function listSeries(db: Db) {
  return db.select(seriesColumns).from(series).orderBy(asc(series.id));
}

export async function findSeries(db: Db, id: number) {
  const [row] = await db
    .select(seriesColumns)
    .from(series)
    .where(eq(series.id, id))
    .limit(1);
  return row;
}

export async function insertSeries(db: Db, newSeries: NewSeries) {
  const [row] = await db
    .insert(series)
    .values(newSeries)
    .returning(seriesColumns);
  return row;
}
