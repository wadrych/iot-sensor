import { problemSchema, seriesSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.ts';
import { series } from '../src/db/schema.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const TEMPERATURE = {
  name: 'Outdoor temperature',
  minValue: -40,
  maxValue: 50,
  color: '#d62728',
  icon: 'triangle',
  unit: '°C',
};
const HUMIDITY = {
  name: 'Humidity',
  minValue: 0,
  maxValue: 100,
  color: '#1f77b4',
  icon: null,
  unit: null,
};

describe('GET /api/series', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    t = await startTestDb();
    app = buildApp({ db: t.db });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await t.stop();
  });

  beforeEach(async () => {
    await t.db.delete(series);
  });

  function get(url: string) {
    return app.inject({ method: 'GET', url });
  }

  async function insertSeries(
    ...rows: (typeof TEMPERATURE | typeof HUMIDITY)[]
  ) {
    return t.db.insert(series).values(rows).returning({ id: series.id });
  }

  it('returns an empty array when there are no series', async () => {
    const res = await get('/api/series');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('lists all series in order, publicly', async () => {
    const [first, second] = await insertSeries(TEMPERATURE, HUMIDITY);

    const res = await get('/api/series');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(z.array(seriesSchema).parse(res.json())).toEqual([
      { id: first?.id, ...TEMPERATURE },
      { id: second?.id, ...HUMIDITY },
    ]);
    expect(res.body).not.toContain('createdAt');
  });

  it('returns one series by id', async () => {
    const [row] = await insertSeries(TEMPERATURE);

    const res = await get(`/api/series/${String(row?.id)}`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: row?.id, ...TEMPERATURE });
  });

  it.each([
    ['a missing id', '999999999'],
    ['letters', 'abc'],
    ['zero', '0'],
    ['a negative number', '-1'],
    ['a decimal', '1.5'],
    ['a number too large for the column', '2147483648'],
  ])('returns 404 Problem Details for %s', async (_, id) => {
    const res = await get(`/api/series/${id}`);

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemSchema.parse(res.json()).status).toBe(404);
  });
});
