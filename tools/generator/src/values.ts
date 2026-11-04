export const MODES = ['range', 'random', 'sine'] as const;
export type Mode = (typeof MODES)[number];

const WALK_STEP = 0.05;

export interface ValueOptions {
  mode: Mode;
  min: number;
  max: number;
  periodMs: number;
  random?: () => number;
}

export type ValueSource = (timestamp: Date) => number;

export function createValueSource({
  mode,
  min,
  max,
  periodMs,
  random = Math.random,
}: ValueOptions): ValueSource {
  const span = max - min;

  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  switch (mode) {
    case 'range':
      return () => clamp(min + random() * span);
    case 'random': {
      let current = min + span / 2;
      return () => {
        current = clamp(current + (random() * 2 - 1) * span * WALK_STEP);
        return current;
      };
    }
    case 'sine':
      return (timestamp) => {
        const phase = (2 * Math.PI * timestamp.getTime()) / periodMs;
        return clamp(min + (span * (1 + Math.sin(phase))) / 2);
      };
  }
}
