import { sensorCreatedSchema, sensorSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

describe('GET /api/sensors', () => {
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
    seriesId = row?.id ?? 0;
  });

  function get(url: string, auth: string | null = token) {
    return app.inject({
      method: 'GET',
      url,
      headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
    });
  }

  async function register(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sensors',
      headers: { authorization: `Bearer ${token}` },
      payload: { name, seriesId },
    });
    return sensorCreatedSchema.parse(res.json());
  }

  async function revoke(id: number) {
    await t.db
      .update(sensors)
      .set({ revokedAt: new Date() })
      .where(eq(sensors.id, id));
  }

  it('returns an empty array when there are no sensors', async () => {
    const res = await get('/api/sensors');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('lists active sensors in order without their keys', async () => {
    const first = await register('Balcony');
    const second = await register('Garden');

    const res = await get('/api/sensors');

    expect(res.statusCode).toBe(200);
    expect(z.array(sensorSchema).parse(res.json())).toEqual([
      sensorSchema.parse(first),
      sensorSchema.parse(second),
    ]);
    expect(res.body).not.toContain(first.apiKey);
    expect(res.body).not.toMatch(/"(apiKey|keyHash|revokedAt)"/);
  });

  it('hides unregistered sensors from the list', async () => {
    const revoked = await register('Balcony');
    const active = await register('Garden');
    await revoke(revoked.id);

    const res = await get('/api/sensors');

    expect(
      z
        .array(sensorSchema)
        .parse(res.json())
        .map((s) => s.id),
    ).toEqual([active.id]);
  });

  it('returns one sensor by id without its key', async () => {
    const created = await register('Balcony');

    const res = await get(`/api/sensors/${String(created.id)}`);

    expect(res.statusCode).toBe(200);
    expect(sensorSchema.parse(res.json())).toEqual(sensorSchema.parse(created));
    expect(res.body).not.toContain(created.apiKey);
  });

  it('reports the time of the latest measurement', async () => {
    const sensor = await register('Balcony');
    await t.db.insert(measurements).values([
      {
        seriesId,
        sensorId: sensor.id,
        value: 20,
        timestamp: new Date('2026-11-01T10:00:00Z'),
      },
      {
        seriesId,
        sensorId: sensor.id,
        value: 21,
        timestamp: new Date('2026-11-01T12:00:00Z'),
      },
      {
        seriesId,
        sensorId: sensor.id,
        value: 19,
        timestamp: new Date('2026-11-01T08:00:00Z'),
      },
    ]);

    const one = sensorSchema.parse(
      (await get(`/api/sensors/${String(sensor.id)}`)).json(),
    );
    const [listed] = z
      .array(sensorSchema)
      .parse((await get('/api/sensors')).json());

    expect(one.lastMeasurementAt).toBe('2026-11-01T12:00:00.000Z');
    expect(listed?.lastMeasurementAt).toBe('2026-11-01T12:00:00.000Z');
  });

  it('returns 404 for an unregistered sensor', async () => {
    const sensor = await register('Balcony');
    await revoke(sensor.id);

    const res = await get(`/api/sensors/${String(sensor.id)}`);

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it.each([
    ['a missing id', '999999999'],
    ['letters', 'abc'],
    ['zero', '0'],
    ['a number too large for the column', '2147483648'],
  ])('returns 404 for %s', async (_, id) => {
    expect((await get(`/api/sensors/${id}`)).statusCode).toBe(404);
  });

  it.each([['/api/sensors'], ['/api/sensors/1'], ['/api/sensors/abc']])(
    'returns 401 for %s without a token',
    async (url) => {
      expect((await get(url, null)).statusCode).toBe(401);
    },
  );
});
