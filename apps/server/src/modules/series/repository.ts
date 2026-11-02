import { asc, eq, and, gt, lt, or } from 'drizzle-orm';
import type { Db, Queryable } from '../../db/client.ts';
import { series, measurements } from '../../db/schema.ts';

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

export async function lockSeries(tx: Queryable, id: number) {
  const [row] = await tx
    .select({ id: series.id })
    .from(series)
    .where(eq(series.id, id))
    .for('update');
  return row;
}

export async function hasMeasurmentOutside(
  tx: Queryable,
  seriesId: number,
  minValue: number,
  maxValue: number,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: measurements.id })
    .from(measurements)
    .where(
      and(
        eq(measurements.seriesId, seriesId),
        or(lt(measurements.value, minValue), gt(measurements.value, maxValue)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function updateSeries(
  tx: Queryable,
  id: number,
  values: NewSeries,
) {
  const [row] = await tx
    .update(series)
    .set(values)
    .where(eq(series.id, id))
    .returning(seriesColumns);
  return row;
}

export async function deleteSeries(db: Db, id: number): Promise<boolean> {
  const deleted = await db
    .delete(series)
    .where(eq(series.id, id))
    .returning({ id: series.id });
  return deleted.length > 0;
}
