import { describe, expect, it } from 'vitest';
import { createValueSource, MODES } from '../src/values.ts';

const DAY = 86_400_000;

describe('createValueSource', () => {
  it('range maps the random number linearly onto [min, max]', () => {
    const samples = [0, 0.5, 0.75];
    const next = createValueSource({
      mode: 'range',
      min: -10,
      max: 30,
      periodMs: DAY,
      random: () => samples.shift() ?? 0,
    });

    expect([next(new Date()), next(new Date()), next(new Date())]).toEqual([
      -10, 10, 20,
    ]);
  });

  it('random walks from the middle in steps of at most 5% of the range', () => {
    const next = createValueSource({
      mode: 'random',
      min: 0,
      max: 100,
      periodMs: DAY,
    });
    let previous = 50;

    for (let i = 0; i < 1000; i++) {
      const value = next(new Date());
      expect(Math.abs(value - previous)).toBeLessThanOrEqual(5);
      previous = value;
    }
  });

  it('sine starts in the middle, peaks after a quarter and bottoms after three quarters of the period', () => {
    const next = createValueSource({
      mode: 'sine',
      min: 0,
      max: 10,
      periodMs: DAY,
    });

    expect(next(new Date(0))).toBeCloseTo(5);
    expect(next(new Date(DAY / 4))).toBeCloseTo(10);
    expect(next(new Date((3 * DAY) / 4))).toBeCloseTo(0);
  });

  it.each(MODES)(
    '%s never leaves [min, max], even with float rounding',
    (mode) => {
      const extremes = [0, 1 - Number.EPSILON];
      const next = createValueSource({
        mode,
        min: 0.1,
        max: 0.3,
        periodMs: DAY,
        random: () => extremes[Math.floor(Math.random() * 2)] ?? 0,
      });

      for (let i = 0; i < 1000; i++) {
        const value = next(new Date((i * DAY) / 4));
        expect(value).toBeGreaterThanOrEqual(0.1);
        expect(value).toBeLessThanOrEqual(0.3);
      }
    },
  );
});
