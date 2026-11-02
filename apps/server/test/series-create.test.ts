import { problemSchema, seriesSchema } from '@iot-sensor/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { series } from '../src/db/schema.ts';
import { adminToken } from './helpers/auth.ts';
import { startTestDb, type TestDb } from './helpers/db.ts';

const INPUT = {
  name: 'Outdoor temperature',
  minValue: -40,
  maxValue: 50,
  color: '#d62728',
  icon: 'triangle',
  unit: '°C',
};

describe('POST /api/series', () => {
  let t: TestDb;
  let app: ReturnType<typeof buildApp>;
  let token: string;

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
  });

  function create(body: object, auth: string | null = token) {
    return app.inject({
      method: 'POST',
      url: '/api/series',
      headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
      payload: body,
    });
  }

  async function storedCount(): Promise<number> {
    return (await t.db.select().from(series)).length;
  }

  it('returns 201 with Location and the created series', async () => {
    const res = await create(INPUT);

    expect(res.statusCode).toBe(201);
    const created = seriesSchema.parse(res.json());
    expect(created).toEqual({ id: created.id, ...INPUT });
    expect(res.headers.location).toBe(`/api/series/${String(created.id)}`);

    const read = await app.inject({
      method: 'GET',
      url: res.headers.location ?? '',
    });
    expect(read.json()).toEqual(created);
  });

  it('stores missing icon and unit as null', async () => {
    const res = await create({
      name: 'Pressure',
      minValue: 900,
      maxValue: 1100,
      color: '#2ca02c',
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ icon: null, unit: null });
  });

  it('returns 401 without a token and stores nothing', async () => {
    const res = await create(INPUT, null);

    expect(res.statusCode).toBe(401);
    expect(await storedCount()).toBe(0);
  });

  it.each([
    ['minValue equal to maxValue', { minValue: 10, maxValue: 10 }, 'minValue'],
    ['minValue above maxValue', { minValue: 11, maxValue: 10 }, 'minValue'],
    ['an unknown icon', { icon: 'smiley' }, 'icon'],
  ])('returns 422 for %s and stores nothing', async (_, change, field) => {
    const res = await create({ ...INPUT, ...change });

    expect(res.statusCode).toBe(422);
    const problem = problemSchema.parse(res.json());
    expect(problem.errors?.map((e) => e.field)).toEqual([field]);
    expect(await storedCount()).toBe(0);
  });

  it('returns 422 for a duplicate name', async () => {
    await create(INPUT);

    const res = await create({ ...INPUT, color: '#000000' });

    expect(res.statusCode).toBe(422);
    expect(problemSchema.parse(res.json()).errors?.[0]?.field).toBe('name');
    expect(await storedCount()).toBe(1);
  });

  it.each([
    ['a missing name', { name: undefined }],
    ['an empty name', { name: '' }],
    ['a name longer than 100 characters', { name: 'x'.repeat(101) }],
    ['a non-numeric minValue', { minValue: 'low' }],
    ['a colour that is not #RRGGBB', { color: 'red' }],
    ['a unit longer than 20 characters', { unit: 'x'.repeat(21) }],
  ])('returns 400 for %s', async (_, change) => {
    const res = await create({ ...INPUT, ...change });

    expect(res.statusCode).toBe(400);
    expect(problemSchema.parse(res.json()).status).toBe(400);
    expect(await storedCount()).toBe(0);
  });
});
