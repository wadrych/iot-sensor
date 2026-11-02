import { problemSchema, seriesSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { generateSessionToken, hashToken } from '../src/modules/auth/tokens.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const ORIGINAL = {
  name: 'Outdoor temperature',
  minValue: 0,
  maxValue: 100,
  color: '#d62728',
  icon: 'triangle',
  unit: '°C',
};
const UPDATED = {
  name: 'Garden temperature',
  minValue: -50,
  maxValue: 60,
  color: '#1f77b4',
  icon: 'star',
  unit: 'K',
};

describe('PUT /api/series/{seriesId}', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let seriesId: number;

  beforeAll(async () => {
    t = await startTestDb();
    app = buildApp({ db: t.db });
    token = await adminToken(app, t.db);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  // Deleting series also deletes their sensors and measurements (cascade)
  beforeEach(async () => {
    await t.db.delete(series);
    const [row] = await t.db
      .insert(series)
      .values(ORIGINAL)
      .returning({ id: series.id });
    seriesId = row?.id ?? 0;
  });

  async function addMeasurements(...values: number[]) {
    const [sensor] = await t.db
      .insert(sensors)
      .values({
        name: 'Balcony',
        seriesId,
        keyHash: hashToken(generateSessionToken()),
      })
      .returning({ id: sensors.id });
    await t.db
      .insert(measurements)
      .values(
        values.map((value) => ({ seriesId, sensorId: sensor?.id ?? 0, value })),
      );
  }

  function put(id: number | string, body: object, auth: string | null = token) {
    return app.inject({
      method: 'PUT',
      url: `/api/series/${String(id)}`,
      headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
      payload: body,
    });
  }

  async function stored() {
    const [row] = await t.db
      .select()
      .from(series)
      .where(eq(series.id, seriesId));
    return row;
  }

  it('replaces all fields and returns the updated series', async () => {
    const res = await put(seriesId, UPDATED);

    expect(res.statusCode).toBe(200);
    expect(seriesSchema.parse(res.json())).toEqual({
      id: seriesId,
      ...UPDATED,
    });
    expect(await stored()).toMatchObject(UPDATED);
  });

  it('clears icon and unit when they are left out (full replacement)', async () => {
    const withoutOptional = {
      name: UPDATED.name,
      minValue: UPDATED.minValue,
      maxValue: UPDATED.maxValue,
      color: UPDATED.color,
    };

    const res = await put(seriesId, withoutOptional);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ icon: null, unit: null });
  });

  it('returns 409 when the new range excludes stored measurements', async () => {
    await addMeasurements(30);

    const res = await put(seriesId, {
      ...ORIGINAL,
      minValue: 50,
      maxValue: 60,
    });

    expect(res.statusCode).toBe(409);
    expect(problemSchema.parse(res.json()).status).toBe(409);
    expect(await stored()).toMatchObject({ minValue: 0, maxValue: 100 });
  });

  it('accepts a range whose limits equal stored values (inclusive)', async () => {
    await addMeasurements(20, 40);

    const res = await put(seriesId, {
      ...ORIGINAL,
      minValue: 20,
      maxValue: 40,
    });

    expect(res.statusCode).toBe(200);
  });

  it('keeps its own name without a conflict', async () => {
    const res = await put(seriesId, { ...ORIGINAL, color: '#000000' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 422 when renamed to the name of another series', async () => {
    await t.db.insert(series).values({ ...ORIGINAL, name: 'Humidity' });

    const res = await put(seriesId, { ...ORIGINAL, name: 'Humidity' });

    expect(res.statusCode).toBe(422);
    expect(problemSchema.parse(res.json()).errors?.[0]?.field).toBe('name');
  });

  it('returns 422 for minValue not below maxValue', async () => {
    const res = await put(seriesId, { ...ORIGINAL, minValue: 5, maxValue: 5 });
    expect(res.statusCode).toBe(422);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await put(seriesId, { ...ORIGINAL, color: 'red' });
    expect(res.statusCode).toBe(400);
  });

  it.each([['999999999'], ['abc']])('returns 404 for series %s', async (id) => {
    const res = await put(id, UPDATED);
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 without a token and changes nothing', async () => {
    const res = await put(seriesId, UPDATED, null);

    expect(res.statusCode).toBe(401);
    expect(await stored()).toMatchObject(ORIGINAL);
  });

  it('locks the series row while checking the range', async () => {
    await addMeasurements(50);
    const [sensor] = await t.db.select({ id: sensors.id }).from(sensors);

    // Another transaction locks the series first, as a measurement insert will (O6)
    let releaseLock = (): void => undefined;
    const holding = t.db.transaction(async (tx) => {
      await tx
        .select()
        .from(series)
        .where(eq(series.id, seriesId))
        .for('share');
      await new Promise<void>((resolve) => (releaseLock = resolve));
      await tx
        .insert(measurements)
        .values({ seriesId, sensorId: sensor?.id ?? 0, value: 90 });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The range 0–60 fits the committed value 50, but not the 90 being added
    const update = put(seriesId, { ...ORIGINAL, minValue: 0, maxValue: 60 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseLock();
    await holding;

    expect((await update).statusCode).toBe(409);
  });
});
