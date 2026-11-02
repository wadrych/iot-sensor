import { measurementSchema, problemSchema } from '@iot-sensor/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { measurements, sensors, series } from '../src/db/schema.ts';
import { hashToken } from '../src/modules/auth/tokens.ts';
import { generateApiKey } from '../src/modules/sensors/api-key.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const MINUTE_MS = 60 * 1000;

describe('POST /api/measurements', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let seriesId: number;
  let sensorId: number;
  let apiKey: string;

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
      .values({ name: 'Humidity', minValue: 0, maxValue: 10, color: '#1f77b4' })
      .returning({ id: series.id });
    seriesId = row?.id ?? 0;
    apiKey = generateApiKey();
    const [sensor] = await t.db
      .insert(sensors)
      .values({ name: 'Balcony', seriesId, keyHash: hashToken(apiKey) })
      .returning({ id: sensors.id });
    sensorId = sensor?.id ?? 0;
  });

  function send(
    body: object,
    headers: Record<string, string> = { 'x-api-key': apiKey },
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/measurements',
      headers,
      payload: body,
    });
  }

  function stored() {
    return t.db.select().from(measurements);
  }

  it('stores the value in the series of the key and returns 201 with Location', async () => {
    const res = await send({ value: 5.5, timestamp: '2026-01-10T11:00:00Z' });

    expect(res.statusCode).toBe(201);
    const created = measurementSchema.parse(res.json());
    expect(created).toEqual({
      id: created.id,
      seriesId,
      sensorId,
      value: 5.5,
      timestamp: '2026-01-10T11:00:00.000Z',
    });
    expect(res.headers.location).toBe(
      `/api/measurements/${String(created.id)}`,
    );
    expect(await stored()).toHaveLength(1);
  });

  it('accepts a timestamp with a time zone offset and returns it in UTC', async () => {
    const res = await send({
      value: 1,
      timestamp: '2026-01-10T12:00:00+02:00',
    });

    expect(measurementSchema.parse(res.json()).timestamp).toBe(
      '2026-01-10T10:00:00.000Z',
    );
  });

  it('uses the server time when the timestamp is missing', async () => {
    const before = Date.now();
    const res = await send({ value: 1 });
    const after = Date.now();

    expect(res.statusCode).toBe(201);
    const timestamp = Date.parse(measurementSchema.parse(res.json()).timestamp);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it.each([[0], [10]])('accepts the range boundary %d', async (value) => {
    expect((await send({ value })).statusCode).toBe(201);
  });

  it.each([[-0.1], [10.1]])(
    'returns 422 for %d outside the range and stores nothing',
    async (value) => {
      const res = await send({ value });

      expect(res.statusCode).toBe(422);
      const problem = problemSchema.parse(res.json());
      expect(problem.detail).toContain('[0, 10]');
      expect(problem.errors?.[0]?.field).toBe('value');
      expect(await stored()).toHaveLength(0);
    },
  );

  it('accepts a timestamp less than 5 minutes ahead', async () => {
    const timestamp = new Date(Date.now() + 4 * MINUTE_MS).toISOString();

    expect((await send({ value: 1, timestamp })).statusCode).toBe(201);
  });

  it('returns 422 for a timestamp more than 5 minutes ahead', async () => {
    const timestamp = new Date(Date.now() + 60 * MINUTE_MS).toISOString();

    const res = await send({ value: 1, timestamp });

    expect(res.statusCode).toBe(422);
    expect(problemSchema.parse(res.json()).errors?.[0]?.field).toBe(
      'timestamp',
    );
    expect(await stored()).toHaveLength(0);
  });

  it('logs rejected measurements as errors (F4)', async () => {
    const logs: string[] = [];
    const logged = buildApp(
      { db: t.db },
      {
        logger: {
          level: 'error',
          stream: { write: (line) => logs.push(line) },
        },
      },
    );

    await logged.inject({
      method: 'POST',
      url: '/api/measurements',
      headers: { 'x-api-key': apiKey },
      payload: { value: 11 },
    });
    await logged.close();

    const entry = logs
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((log) => log.msg === 'Measurement rejected');
    expect(entry).toMatchObject({ level: 50, sensorId, seriesId, value: 11 });
    expect(entry?.reason).toContain('[0, 10]');
  });

  it.each([
    ['a value that is a string', { value: 'abc' }],
    ['a missing value', {}],
    ['a timestamp that is not a date', { value: 1, timestamp: 'yesterday' }],
    [
      'a timestamp without a time zone',
      { value: 1, timestamp: '2026-01-10T10:00:00' },
    ],
    ['an impossible date', { value: 1, timestamp: '2026-02-30T10:00:00Z' }],
  ])('returns 400 for %s', async (_, body) => {
    expect((await send(body)).statusCode).toBe(400);
  });

  it.each([
    ['without a key', {}],
    ['with a wrong key', { 'x-api-key': 'x'.repeat(40) }],
    ['with an empty key', { 'x-api-key': '' }],
  ])('returns 401 %s', async (_, headers) => {
    const res = await send({ value: 1 }, headers);

    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('returns 401 for an admin token without a key', async () => {
    const res = await send({ value: 1 }, { authorization: `Bearer ${token}` });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for the key of an unregistered sensor', async () => {
    await t.db
      .update(sensors)
      .set({ revokedAt: new Date() })
      .where(eq(sensors.id, sensorId));

    expect((await send({ value: 1 })).statusCode).toBe(401);
    expect(await stored()).toHaveLength(0);
  });

  it('checks the key before the body', async () => {
    expect((await send({ value: 'abc' }, {})).statusCode).toBe(401);
  });

  it('waits for a concurrent range change before checking the value', async () => {
    let releaseLock = (): void => undefined;
    const narrowing = t.db.transaction(async (tx) => {
      await tx
        .select()
        .from(series)
        .where(eq(series.id, seriesId))
        .for('update');
      await tx
        .update(series)
        .set({ maxValue: 5 })
        .where(eq(series.id, seriesId));
      await new Promise<void>((resolve) => (releaseLock = resolve));
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const insert = send({ value: 8 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseLock();
    await narrowing;

    expect((await insert).statusCode).toBe(422);
    expect(await stored()).toHaveLength(0);
  });
});
