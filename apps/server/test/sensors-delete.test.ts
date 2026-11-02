import { problemSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { generateSessionToken, hashToken } from '../src/modules/auth/tokens.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

describe('DELETE /api/sensors/{sensorId}', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let sensorId: number;
  let otherSensorId: number;

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
        name: 'Temperature',
        minValue: -40,
        maxValue: 50,
        color: '#d62728',
      })
      .returning({ id: series.id });
    const seriesId = row?.id ?? 0;
    const [first, second] = await t.db
      .insert(sensors)
      .values(
        ['Balcony', 'Garden'].map((name) => ({
          name,
          seriesId,
          keyHash: hashToken(generateSessionToken()),
        })),
      )
      .returning({ id: sensors.id });
    sensorId = first?.id ?? 0;
    otherSensorId = second?.id ?? 0;
    await t.db.insert(measurements).values([
      { seriesId, sensorId, value: 20 },
      { seriesId, sensorId: otherSensorId, value: 21 },
    ]);
  });

  function del(id: number | string, auth: string | null = token) {
    return app.inject({
      method: 'DELETE',
      url: `/api/sensors/${String(id)}`,
      headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
    });
  }

  async function revokedAt(id: number) {
    const [row] = await t.db
      .select({ revokedAt: sensors.revokedAt })
      .from(sensors)
      .where(eq(sensors.id, id));
    return row?.revokedAt;
  }

  it('returns 204 and the sensor is no longer readable', async () => {
    const res = await del(sensorId);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const read = await app.inject({
      method: 'GET',
      url: `/api/sensors/${String(sensorId)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(404);
  });

  it('revokes only that sensor and keeps all measurements', async () => {
    await del(sensorId);

    expect(await revokedAt(sensorId)).toBeInstanceOf(Date);
    expect(await revokedAt(otherSensorId)).toBeNull();
    expect(await t.db.select().from(measurements)).toHaveLength(2);
  });

  it('returns 404 when unregistering the same sensor twice', async () => {
    await del(sensorId);
    const first = await revokedAt(sensorId);

    const res = await del(sensorId);

    expect(res.statusCode).toBe(404);
    expect(problemSchema.parse(res.json()).status).toBe(404);
    expect(await revokedAt(sensorId)).toEqual(first);
  });

  it.each([['999999999'], ['abc'], ['2147483648']])(
    'returns 404 for sensor %s',
    async (id) => {
      expect((await del(id)).statusCode).toBe(404);
    },
  );

  it('returns 401 without a token and revokes nothing', async () => {
    const res = await del(sensorId, null);

    expect(res.statusCode).toBe(401);
    expect(await revokedAt(sensorId)).toBeNull();
  });
});
