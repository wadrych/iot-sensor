import { problemSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { generateSessionToken, hashToken } from '../src/modules/auth/tokens.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const SERIES = {
  name: 'Outdoor temperature',
  minValue: -40,
  maxValue: 50,
  color: '#d62728',
};

describe('DELETE /api/series/{seriesId}', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let seriesId: number;
  let otherSeriesId: number;

  beforeAll(async () => {
    t = await startTestDb();
    app = buildApp({ db: t.db });
    token = await adminToken(app, t.db);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  // Two series, each with one sensor and one measurement
  beforeEach(async () => {
    await t.db.delete(series);
    const [first, second] = await t.db
      .insert(series)
      .values([SERIES, { ...SERIES, name: 'Humidity' }])
      .returning({ id: series.id });
    seriesId = first?.id ?? 0;
    otherSeriesId = second?.id ?? 0;
    for (const id of [seriesId, otherSeriesId]) {
      const [sensor] = await t.db
        .insert(sensors)
        .values({
          name: `Sensor ${String(id)}`,
          seriesId: id,
          keyHash: hashToken(generateSessionToken()),
        })
        .returning({ id: sensors.id });
      await t.db
        .insert(measurements)
        .values({ seriesId: id, sensorId: sensor?.id ?? 0, value: 20 });
    }
  });

  function del(id: number | string, auth: string | null = token) {
    return app.inject({
      method: 'DELETE',
      url: `/api/series/${String(id)}`,
      headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
    });
  }

  async function countFor(id: number) {
    const [s, m] = await Promise.all([
      t.db.select().from(sensors).where(eq(sensors.seriesId, id)),
      t.db.select().from(measurements).where(eq(measurements.seriesId, id)),
    ]);
    return { sensors: s.length, measurements: m.length };
  }

  it('returns 204 and the series is gone', async () => {
    const res = await del(seriesId);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const read = await app.inject({
      method: 'GET',
      url: `/api/series/${String(seriesId)}`,
    });
    expect(read.statusCode).toBe(404);
  });

  it('removes its sensors and measurements, but not those of other series', async () => {
    await del(seriesId);

    expect(await countFor(seriesId)).toEqual({ sensors: 0, measurements: 0 });
    expect(await countFor(otherSeriesId)).toEqual({
      sensors: 1,
      measurements: 1,
    });
  });

  it('returns 404 when deleting the same series twice', async () => {
    await del(seriesId);

    const res = await del(seriesId);

    expect(res.statusCode).toBe(404);
    expect(problemSchema.parse(res.json()).status).toBe(404);
  });

  it.each([['999999999'], ['abc']])('returns 404 for series %s', async (id) => {
    expect((await del(id)).statusCode).toBe(404);
  });

  it('returns 401 without a token and deletes nothing', async () => {
    const res = await del(seriesId, null);

    expect(res.statusCode).toBe(401);
    expect(await countFor(seriesId)).toEqual({ sensors: 1, measurements: 1 });
  });
});
