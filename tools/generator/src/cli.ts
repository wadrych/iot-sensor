import { sendMeasurement } from './client.ts';
import { ConfigError, parseConfig, USAGE } from './config.ts';
import { run } from './run.ts';
import { setTimeout as sleep } from 'node:timers/promises';

function readConfig() {
  try {
    return parseConfig(process.argv.slice(2), process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return undefined;
  }
}

async function main(): Promise<number> {
  const config = readConfig();
  if (config === undefined) return 2;
  if (config === 'help') {
    console.log(USAGE);
    return 0;
  }

  const stop = new AbortController();
  process.once('SIGINT', () => {
    stop.abort();
  });

  const { stored, failed } = await run(config, {
    send: (input) => sendMeasurement(config.api, config.key, input),
    now: () => new Date(),
    sleep: (ms) =>
      sleep(ms, undefined, { signal: stop.signal }).catch(() => undefined),
    log: (line) => {
      console.log(line);
    },
    signal: stop.signal,
  });
  console.log(`Done: ${String(stored)} stored, ${String(failed)} failed`);
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main();
