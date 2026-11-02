import { problemSchema, sensorCreatedSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { sensors, series } from '../src/db/schema.ts';
import { hashToken } from '../src/modules/auth/tokens.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

describe('POST /api/sensors', () => {
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

  function register(body: object, auth: string | null = token) {
    return app.inject({
      method: 'POST',
      url: '/api/sensors',
      headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
      payload: body,
    });
  }

  async function storedSensors() {
    return t.db.select().from(sensors);
  }

  it('returns 201 with Location, the sensor and a API key', async () => {
    const res = await register({ name: 'Balcony', seriesId });

    expect(res.statusCode).toBe(201);
    const created = sensorCreatedSchema.parse(res.json());
    expect(created).toMatchObject({
      name: 'Balcony',
      seriesId,
      lastMeasurementAt: null,
    });
    expect(created.apiKey).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers.location).toBe(`/api/sensors/${String(created.id)}`);
  });

  it('stores only the hash of the key', async () => {
    const { apiKey } = sensorCreatedSchema.parse(
      (await register({ name: 'Balcony', seriesId })).json(),
    );

    const rows = await storedSensors();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.keyHash).toBe(hashToken(apiKey));
    expect(JSON.stringify(rows)).not.toContain(apiKey);
  });

  it('gives every sensor a different key', async () => {
    const first = sensorCreatedSchema.parse(
      (await register({ name: 'Balcony', seriesId })).json(),
    );
    const second = sensorCreatedSchema.parse(
      (await register({ name: 'Garden', seriesId })).json(),
    );

    expect(first.apiKey).not.toBe(second.apiKey);
  });

  it.each([
    ['a series that does not exist', 999_999_999],
    ['an id too large for the column', 99_999_999_999],
  ])('returns 422 for %s', async (_, missingId) => {
    const res = await register({ name: 'Balcony', seriesId: missingId });

    expect(res.statusCode).toBe(422);
    expect(problemSchema.parse(res.json()).errors?.[0]?.field).toBe('seriesId');
    expect(await storedSensors()).toHaveLength(0);
  });

  it('returns 422 when an active sensor already has the name', async () => {
    await register({ name: 'Balcony', seriesId });

    const res = await register({ name: 'Balcony', seriesId });

    expect(res.statusCode).toBe(422);
    expect(problemSchema.parse(res.json()).errors?.[0]?.field).toBe('name');
  });

  it('allows the name of an unregistered sensor again', async () => {
    await register({ name: 'Balcony', seriesId });
    await t.db.update(sensors).set({ revokedAt: new Date() });

    const res = await register({ name: 'Balcony', seriesId });

    expect(res.statusCode).toBe(201);
  });

  it.each([
    ['a missing name', { seriesId: 1 }],
    ['an empty name', { name: '', seriesId: 1 }],
    ['a seriesId that is a string', { name: 'Balcony', seriesId: 'one' }],
    ['a decimal seriesId', { name: 'Balcony', seriesId: 1.5 }],
  ])('returns 400 for %s', async (_, body) => {
    expect((await register(body)).statusCode).toBe(400);
  });

  it('returns 401 without a token and stores nothing', async () => {
    const res = await register({ name: 'Balcony', seriesId }, null);

    expect(res.statusCode).toBe(401);
    expect(await storedSensors()).toHaveLength(0);
  });
});
