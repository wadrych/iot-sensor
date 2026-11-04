import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../src/config.ts';

const VALID = {
  api: 'https://app.example',
  mode: 'sine',
  min: '-10',
  max: '35',
  count: '24',
  step: '1h',
};
const ENV = { SENSOR_API_KEY: 'env-key' };

// --name=value form, so negative numbers are not mistaken for options.
function argv(options: Record<string, string | undefined> = {}): string[] {
  const merged: Record<string, string | undefined> = { ...VALID, ...options };
  return Object.entries(merged).flatMap(([name, value]) =>
    value === undefined ? [] : [`--${name}=${value}`],
  );
}

const LIVE = { count: undefined, step: undefined };

describe('parseConfig', () => {
  it('parses a backfill run and takes the key from SENSOR_API_KEY', () => {
    expect(parseConfig(argv(), ENV)).toEqual({
      api: 'https://app.example',
      key: 'env-key',
      mode: 'sine',
      min: -10,
      max: 35,
      periodMs: 86_400_000,
      schedule: { kind: 'backfill', count: 24, stepMs: 3_600_000 },
    });
  });

  it('parses a live run, --key wins over the environment', () => {
    const args = [
      ...argv({ ...LIVE, interval: '30s', period: '15m', key: 'arg-key' }),
      '--live',
    ];

    expect(parseConfig(args, ENV)).toMatchObject({
      key: 'arg-key',
      periodMs: 900_000,
      schedule: { kind: 'live', intervalMs: 30_000 },
    });
  });

  it('returns help for -h', () => {
    expect(parseConfig(['-h'], {})).toBe('help');
  });

  it.each([
    ['no key', argv(), {}, 'SENSOR_API_KEY'],
    ['min = max', argv({ min: '5', max: '5' }), ENV, '--max must be greater'],
    ['empty number', argv({ min: '' }), ENV, 'Expected a number'],
    ['non-http URL', argv({ api: 'ftp://a.example' }), ENV, 'http(s) URL'],
    ['unknown mode', argv({ mode: 'wave' }), ENV, 'mode'],
    ['duration without unit', argv({ step: '60' }), ENV, 'duration'],
    ['zero duration', argv({ step: '0s' }), ENV, 'duration'],
    ['zero count', argv({ count: '0' }), ENV, 'count'],
    [
      'live and backfill',
      [...argv({ interval: '1m' }), '--live'],
      ENV,
      'either',
    ],
    ['no schedule', argv(LIVE), ENV, 'either'],
    ['interval without --live', argv({ interval: '1m' }), ENV, 'either'],
    ['unknown option', [...argv(), '--bogus'], ENV, '--bogus'],
    [
      'negative number without =',
      ['--api', 'https://a.example', '--min', '-10'],
      ENV,
      "'--min=-XYZ'",
    ],
  ])('rejects %s', (_name, args, env, message) => {
    expect(() => parseConfig(args, env)).toThrow(ConfigError);
    expect(() => parseConfig(args, env)).toThrow(message);
  });
});
