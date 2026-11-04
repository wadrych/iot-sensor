import { describe, expect, it, vi } from 'vitest';
import type { SendOutcome } from '../src/client.ts';
import type { Config } from '../src/config.ts';
import { run, type RunDeps } from '../src/run.ts';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const HOUR = 3_600_000;

const STORED: SendOutcome = {
  kind: 'stored',
  measurement: {
    id: 1,
    seriesId: 1,
    sensorId: 1,
    value: 1,
    timestamp: NOW.toISOString(),
  },
};
const OUT_OF_RANGE: SendOutcome = {
  kind: 'rejected',
  status: 422,
  detail: 'Value is out of allowed range [0, 100]',
};
const KEY_REFUSED: SendOutcome = {
  kind: 'rejected',
  status: 401,
  detail: 'Invalid API key',
};
const UNREACHABLE: SendOutcome = {
  kind: 'failed',
  reason: 'connection refused',
};

function config(schedule: Config['schedule']): Config {
  return {
    api: 'https://app.example',
    key: 'secret',
    mode: 'range',
    min: 0,
    max: 100,
    periodMs: HOUR,
    schedule,
  };
}

const BACKFILL = config({ kind: 'backfill', count: 3, stepMs: HOUR });
const LIVE = config({ kind: 'live', intervalMs: 30_000 });

// Replies with the given outcomes in order, then with STORED.
function setup(outcomes: SendOutcome[], stopAfter = Infinity) {
  const stop = new AbortController();
  const lines: string[] = [];
  const send = vi.fn<RunDeps['send']>(() => {
    if (send.mock.calls.length >= stopAfter) stop.abort();
    return Promise.resolve(outcomes.shift() ?? STORED);
  });
  const sleep = vi.fn<RunDeps['sleep']>(() => Promise.resolve());
  const deps: RunDeps = {
    send,
    now: () => NOW,
    sleep,
    log: (line) => lines.push(line),
    signal: stop.signal,
  };
  return { deps, send, sleep, lines };
}

describe('run', () => {
  it('backfills count results, oldest first, ending now', async () => {
    const { deps, send } = setup([]);

    expect(await run(BACKFILL, deps)).toEqual({ stored: 3, failed: 0 });
    expect(send.mock.calls.map(([input]) => input.timestamp)).toEqual([
      '2026-11-04T10:00:00.000Z',
      '2026-11-04T11:00:00.000Z',
      '2026-11-04T12:00:00.000Z',
    ]);
  });

  it('prints the server detail of a rejected value and carries on', async () => {
    const { deps, send, lines } = setup([STORED, OUT_OF_RANGE]);

    expect(await run(BACKFILL, deps)).toEqual({ stored: 2, failed: 1 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(lines[1]).toContain(
      'rejected: 422 Value is out of allowed range [0, 100]',
    );
  });

  it.each([
    [
      'a refused key',
      KEY_REFUSED,
      'rejected: unauthorized, 401: Invalid API key',
    ],
    ['an unreachable server', UNREACHABLE, 'failed: connection refused'],
  ])('stops the backfill on %s', async (_name, outcome, message) => {
    const { deps, send, lines } = setup([outcome]);

    expect(await run(BACKFILL, deps)).toEqual({ stored: 0, failed: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([expect.stringContaining(message), 'Stopping.']);
  });

  it('keeps sending live after a network error until stopped', async () => {
    const { deps, send, sleep } = setup([UNREACHABLE], 3);

    expect(await run(LIVE, deps)).toEqual({ stored: 2, failed: 1 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it('stops live mode when the key is refused', async () => {
    const { deps, send } = setup([STORED, KEY_REFUSED], 5);

    expect(await run(LIVE, deps)).toEqual({ stored: 1, failed: 1 });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
