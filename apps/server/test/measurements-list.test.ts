import { measurementSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { generateSessionToken, hashToken } from '../src/modules/auth/tokens.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const T0 = '2026-01-10T10:00:00.000Z';
const T1 = '2026-01-10T11:00:00.000Z';
const T2 = '2026-01-10T12:00:00.000Z';

describe('GET /api/measurements', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let first: number;
  let second: number;

  beforeAll(async () => {
    t = await startTestDb();
    app = buildApp({ db: t.db });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  // Two series with one sensor each; rows inserted out of time order,
  // and both series have a value at T0
  beforeEach(async () => {
    await t.db.delete(series);
    const ids = await t.db
      .insert(series)
      .values(
        ['Temperature', 'Humidity'].map((name) => ({
          name,
          minValue: 0,
          maxValue: 100,
          color: '#1f77b4',
        })),
      )
      .returning({ id: series.id });
    first = ids[0]?.id ?? 0;
    second = ids[1]?.id ?? 0;
    const sensorIds = await t.db
      .insert(sensors)
      .values(
        [first, second].map((seriesId) => ({
          name: `Sensor ${String(seriesId)}`,
          seriesId,
          keyHash: hashToken(generateSessionToken()),
        })),
      )
      .returning({ id: sensors.id });
    const firstSensor = sensorIds[0]?.id ?? 0;
    const secondSensor = sensorIds[1]?.id ?? 0;
    await t.db.insert(measurements).values([
      {
        seriesId: first,
        sensorId: firstSensor,
        value: 3,
        timestamp: new Date(T2),
      },
      {
        seriesId: first,
        sensorId: firstSensor,
        value: 1,
        timestamp: new Date(T0),
      },
      {
        seriesId: first,
        sensorId: firstSensor,
        value: 2,
        timestamp: new Date(T1),
      },
      {
        seriesId: second,
        sensorId: secondSensor,
        value: 4,
        timestamp: new Date(T0),
      },
    ]);
  });

  async function list(query: string) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/measurements${query}`,
    });
    expect(res.statusCode).toBe(200);
    return z.array(measurementSchema).parse(res.json());
  }

  const values = (rows: { value: number }[]) => rows.map((m) => m.value);

  it('lists all measurements publicly, oldest first', async () => {
    const rows = await list('');

    expect(values(rows)).toEqual([1, 4, 2, 3]);
    expect(rows[0]).toMatchObject({ seriesId: first, timestamp: T0 });
  });

  it('returns newest first', async () => {
    expect(values(await list('?sort=-timestamp'))).toEqual([3, 2, 4, 1]);
  });

  it('filters by one series', async () => {
    const rows = await list(`?series=${String(first)}`);

    expect(values(rows)).toEqual([1, 2, 3]);
    expect(rows.every((m) => m.seriesId === first)).toBe(true);
  });

  it('filters by several series', async () => {
    expect(
      await list(`?series=${String(first)},${String(second)}`),
    ).toHaveLength(4);
  });

  it('returns an empty array for a series without measurements', async () => {
    expect(await list('?series=999999999')).toEqual([]);
  });

  it('includes both ends of the from and to interval', async () => {
    const rows = await list(`?series=${String(first)}&from=${T0}&to=${T1}`);

    expect(values(rows)).toEqual([1, 2]);
  });

  it('accepts from and to with a time zone offset', async () => {
    const from = encodeURIComponent('2026-01-10T12:30:00+02:00');

    expect(values(await list(`?from=${from}`))).toEqual([2, 3]);
  });

  it('returns at most limit measurements, after sorting', async () => {
    expect(values(await list('?limit=2'))).toEqual([1, 4]);
    expect(values(await list('?limit=2&sort=-timestamp'))).toEqual([3, 2]);
  });

  it('returns at most 1000 measurements by default', async () => {
    const [sensor] = await t.db.select({ id: sensors.id }).from(sensors);
    await t.db.insert(measurements).values(
      Array.from({ length: 1000 }, () => ({
        seriesId: first,
        sensorId: sensor?.id ?? 0,
        value: 50,
      })),
    );

    expect(await list('')).toHaveLength(1000);
    expect(await list('?limit=10000')).toHaveLength(1004);
  });

  it.each([
    ['from that is not a date', '?from=nie-data'],
    ['to without a time', '?to=2026-01-10'],
    ['from without a time zone', '?from=2026-01-10T10:00:00'],
    ['series that is not a number', '?series=abc'],
    ['an empty series list', '?series='],
    ['an empty item in series', '?series=1,,2'],
    ['series 0', '?series=0'],
    ['a series id too large for the column', '?series=2147483648'],
    ['an unknown sort', '?sort=value'],
    ['limit 0', '?limit=0'],
    ['limit above 10000', '?limit=10001'],
    ['a decimal limit', '?limit=1.5'],
    ['a limit that is not a number', '?limit=abc'],
  ])('returns 400 for %s', async (_, query) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/measurements${query}`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });
});
