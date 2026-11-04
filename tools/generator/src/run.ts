import type { MeasurementInput } from '@iot-sensor/shared';
import type { SendOutcome } from './client.ts';
import type { Config } from './config.ts';
import { createValueSource } from './values.ts';

export interface RunDeps {
  send: (input: MeasurementInput) => Promise<SendOutcome>;
  now: () => Date;
  sleep: (ms: number) => Promise<unknown>;
  log: (line: string) => void;
  signal: AbortSignal;
}

export interface RunSummary {
  stored: number;
  failed: number;
}

function describe(outcome: SendOutcome, value: number, at: Date): string {
  const prefix = `${at.toISOString()} ${value.toFixed(2)}`;
  switch (outcome.kind) {
    case 'stored':
      return `${prefix} stored as #${String(outcome.measurement.id)}`;
    case 'rejected':
      return outcome.status === 401
        ? `${prefix} rejected: unauthorized, 401: ${outcome.detail}`
        : `${prefix} rejected: ${String(outcome.status)} ${outcome.detail}`;
    case 'failed':
      return `${prefix} failed: ${outcome.reason}`;
  }
}

export async function run(config: Config, deps: RunDeps): Promise<RunSummary> {
  const nextValue = createValueSource(config);
  const summary: RunSummary = {
    stored: 0,
    failed: 0,
  };

  async function sendAt(at: Date): Promise<SendOutcome> {
    const value = nextValue(at);
    const outcome = await deps.send({ value, timestamp: at.toISOString() });
    deps.log(describe(outcome, value, at));
    if (outcome.kind === 'stored') summary.stored++;
    else summary.failed++;
    return outcome;
  }

  const keyRefused = (outcome: SendOutcome) =>
    outcome.kind === 'rejected' && outcome.status === 401;

  if (config.schedule.kind === 'backfill') {
    const { count, stepMs } = config.schedule;
    const end = deps.now().getTime();
    for (let i = count - 1; i >= 0; i--) {
      const outcome = await sendAt(new Date(end - i * stepMs));
      if (keyRefused(outcome) || outcome.kind === 'failed') {
        deps.log('Stopping.');
        break;
      }
    }
    return summary;
  }

  while (!deps.signal.aborted) {
    if (keyRefused(await sendAt(deps.now()))) {
      deps.log('Stopping.');
      break;
    }
    await deps.sleep(config.schedule.intervalMs);
  }
  return summary;
}
