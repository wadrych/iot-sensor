import { ConfigError, parseConfig, USAGE } from './config.ts';

try {
  const config = parseConfig(process.argv.slice(2), process.env);
  if (config === 'help') {
    console.log(USAGE);
  } else {
    console.log(
      `Ready: ${config.mode} values in [${String(config.min)}, ${String(config.max)}] for ${config.api}`,
    );
  }
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`${error.message}\n\n${USAGE}`);
  process.exitCode = 2;
}
