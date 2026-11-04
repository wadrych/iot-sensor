import { describe, expect, it, vi } from 'vitest';
import { sendMeasurement } from '../src/client.ts';

const API = 'https://app.example';
const INPUT = { value: 21.5, timestamp: '2026-11-04T08:00:00.000Z' };

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json(body, { status })),
  );
}

function failWith(error: Error) {
  return vi.fn<typeof fetch>(() => Promise.reject(error));
}

describe('sendMeasurement', () => {
  it('posts the value with the API key and returns the stored result', async () => {
    const stored = { id: 7, seriesId: 1, sensorId: 2, ...INPUT };
    const fetchFn = respond(201, stored);

    const outcome = await sendMeasurement(API, 'secret', INPUT, fetchFn);

    expect(outcome).toEqual({ kind: 'stored', measurement: stored });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toEqual(new URL('https://app.example/api/measurements'));
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'x-api-key': 'secret', 'content-type': 'application/json' },
      body: JSON.stringify(INPUT),
    });
  });

  it('returns the Problem Details detail of a rejection', async () => {
    const fetchFn = respond(422, {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'Value 120 is out of allowed range [0, 100]',
    });

    expect(await sendMeasurement(API, 'secret', INPUT, fetchFn)).toEqual({
      kind: 'rejected',
      status: 422,
      detail: 'Value 120 is out of allowed range [0, 100]',
    });
  });

  it.each([
    [
      'refused connection',
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
      }),
      'connection refused',
    ],
    [
      'timeout',
      new DOMException('aborted', 'TimeoutError'),
      'no response within 90 s',
    ],
  ])('reports a %s as failed', async (_name, error, reason) => {
    expect(
      await sendMeasurement(API, 'secret', INPUT, failWith(error)),
    ).toEqual({ kind: 'failed', reason });
  });

  it('reads the reason from a real failed connection', async () => {
    expect(
      await sendMeasurement('http://127.0.0.1:59999', 'secret', INPUT),
    ).toEqual({ kind: 'failed', reason: 'connection refused' });
  });
});
