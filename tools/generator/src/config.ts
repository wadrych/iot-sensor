import { parseArgs } from 'node:util';
import { z } from 'zod';
import { MODES } from './values.ts';

export const USAGE = `Usage:
  node tools/generator/src/cli.ts --api <url> --mode <mode> --min <n> --max <n>
    (--count <n> --step <duration> | --live --interval <duration>) [options]

Sends sensor results to POST /api/measurements.

  --api <url>            app base URL
  --key <key>            sensor API key
  --mode <mode>          range  - uniform random values in [min, max]
                         random - random walk within [min, max]
                         sine   - sine wave between min and max
  --min <n>, --max <n>   value range
  --period <duration>    sine period (default 24h)
  --count <n>            backfill: number of results, timestamps ending now
  --step <duration>      backfill: time between results
  --live                 live: send a current result every --interval
  --interval <duration>  live: time between results
  -h, --help             show this help

Durations: <integer><ms|s|m|h|d>
Negative numbers need '=', e.g. --min=-10.`;

export class ConfigError extends Error {}

const DAY_MS = 86_400_000;
const DURATION = /^(\d+)(ms|s|m|h|d)$/;
const UNIT_MS = new Map([
  ['ms', 1],
  ['s', 1_000],
  ['m', 60_000],
  ['h', 3_600_000],
  ['d', DAY_MS],
]);

const durationSchema = z.string().transform((text, ctx) => {
  const match = DURATION.exec(text);
  const ms = match ? Number(match[1]) * (UNIT_MS.get(match[2] ?? '') ?? 0) : 0;
  if (ms <= 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Expected a positive duration',
    });
    return z.NEVER;
  }
  return ms;
});

const numberSchema = z
  .string()
  .trim()
  .min(1, 'Expected a number')
  .transform(Number)
  .pipe(z.number());

const countSchema = z
  .string()
  .regex(/^\d+$/, 'Expected a whole number')
  .transform(Number)
  .pipe(z.int().min(1).max(10_000));

interface ScheduleArgs {
  count?: number | undefined;
  step?: number | undefined;
  live: boolean;
  interval?: number | undefined;
}

function toSchedule({ count, step, live, interval }: ScheduleArgs) {
  if (live) {
    return interval !== undefined && count === undefined && step === undefined
      ? { kind: 'live' as const, intervalMs: interval }
      : undefined;
  }
  return count !== undefined && step !== undefined && interval === undefined
    ? { kind: 'backfill' as const, count, stepMs: step }
    : undefined;
}

const configSchema = z
  .object({
    api: z.url({ protocol: /^https?$/, error: 'Expected an http(s) URL' }),
    key: z.string('Required: --key or SENSOR_API_KEY').min(1),
    mode: z.enum(MODES),
    min: numberSchema,
    max: numberSchema,
    period: durationSchema.default(DAY_MS),
    count: countSchema.optional(),
    step: durationSchema.optional(),
    live: z.boolean().default(false),
    interval: durationSchema.optional(),
  })
  .transform((args, ctx) => {
    if (args.min >= args.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['max'],
        message: '--max must be greater than --min',
      });
    }
    const schedule = toSchedule(args);
    if (!schedule) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use either --count with --step, or --live with --interval',
      });
    }
    if (!schedule || args.min >= args.max) return z.NEVER;
    return {
      api: args.api,
      key: args.key,
      mode: args.mode,
      min: args.min,
      max: args.max,
      periodMs: args.period,
      schedule,
    };
  });

export type Config = z.output<typeof configSchema>;

function readArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        api: { type: 'string' },
        key: { type: 'string' },
        mode: { type: 'string' },
        min: { type: 'string' },
        max: { type: 'string' },
        period: { type: 'string' },
        count: { type: 'string' },
        step: { type: 'string' },
        live: { type: 'boolean' },
        interval: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (error) {
    throw new ConfigError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function parseConfig(
  args: string[],
  env: Record<string, string | undefined>,
): Config | 'help' {
  const values = readArgs(args);
  if (values.help) return 'help';

  const result = configSchema.safeParse({
    ...values,
    key: values.key ?? env.SENSOR_API_KEY,
  });
  if (!result.success) {
    throw new ConfigError(z.prettifyError(result.error));
  }
  return result.data;
}
