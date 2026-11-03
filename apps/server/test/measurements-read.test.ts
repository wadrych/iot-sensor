import { measurementSchema, problemSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { generateSessionToken, hashToken } from '../src/modules/auth/tokens.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

describe('/api/measurements/{measurementId}', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let seriesId: number;
  let sensorId: number;
  let measurementId: number;

  beforeAll(async () => {
    t = await startTestDb();
    app = buildApp({ db: t.db });
    token = await adminToken(app, t.db);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  beforeEach(async () => {
    await t.db.delete(series);
    const [row] = await t.db
      .insert(series)
      .values({
        name: 'Humidity',
        minValue: 0,
        maxValue: 100,
        color: '#1f77b4',
      })
      .returning({ id: series.id });
    seriesId = row?.id ?? 0;
    const [sensor] = await t.db
      .insert(sensors)
      .values({
        name: 'Balcony',
        seriesId,
        keyHash: hashToken(generateSessionToken()),
      })
      .returning({ id: sensors.id });
    sensorId = sensor?.id ?? 0;
    const [measurement] = await t.db
      .insert(measurements)
      .values({
        seriesId,
        sensorId,
        value: 7,
        timestamp: new Date('2026-01-10T10:00:00Z'),
      })
      .returning({ id: measurements.id });
    measurementId = measurement?.id ?? 0;
  });

  function get(id: number | string) {
    return app.inject({
      method: 'GET',
      url: `/api/measurements/${String(id)}`,
    });
  }

  it('returns one measurement publicly', async () => {
    const res = await get(measurementId);

    expect(res.statusCode).toBe(200);
    expect(measurementSchema.parse(res.json())).toEqual({
      id: measurementId,
      seriesId,
      sensorId,
      value: 7,
      timestamp: '2026-01-10T10:00:00.000Z',
    });
  });

  it('still returns a measurement of an unregistered sensor', async () => {
    await t.db
      .update(sensors)
      .set({ revokedAt: new Date() })
      .where(eq(sensors.id, sensorId));

    expect((await get(measurementId)).statusCode).toBe(200);
  });

  it.each([
    ['a missing id', '999999999'],
    ['letters', 'abc'],
    ['zero', '0'],
    ['a number too large for the column', '2147483648'],
  ])('returns 404 Problem Details for %s', async (_, id) => {
    const res = await get(id);

    expect(res.statusCode).toBe(404);
    expect(problemSchema.parse(res.json()).status).toBe(404);
  });

  it.each([['PUT'], ['PATCH'], ['DELETE']] as const)(
    'returns 405 for %s and keeps the value',
    async (method) => {
      const res = await app.inject({
        method,
        url: `/api/measurements/${String(measurementId)}`,
        headers: { authorization: `Bearer ${token}` },
        ...(method === 'DELETE' ? {} : { payload: { value: 8 } }),
      });

      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('GET, HEAD');
      expect(res.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(
        measurementSchema.parse((await get(measurementId)).json()).value,
      ).toBe(7);
    },
  );
});
