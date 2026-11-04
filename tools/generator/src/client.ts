import {
  measurementSchema,
  problemSchema,
  type Measurement,
  type MeasurementInput,
} from '@iot-sensor/shared';

export const REQUEST_TIMEOUT_MS = 90_000;

export type SendOutcome =
  | { kind: 'stored'; measurement: Measurement }
  | { kind: 'rejected'; status: number; detail: string }
  | { kind: 'failed'; reason: string };

const NETWORK_ERRORS = new Map([
  ['ECONNREFUSED', 'connection refused'],
  ['ECONNRESET', 'connection reset'],
  ['ENOTFOUND', 'host not found'],
  ['ETIMEDOUT', 'connection timed out'],
]);

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return `no response within ${String(REQUEST_TIMEOUT_MS / 1000)} s`;
  }
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) {
    const code = 'code' in cause ? String(cause.code) : '';
    return NETWORK_ERRORS.get(code) ?? (code || cause.message);
  }
  return error instanceof Error ? error.message : String(error);
}

export async function sendMeasurement(
  api: string,
  key: string,
  input: MeasurementInput,
  fetchFn: typeof fetch = fetch,
): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetchFn(new URL('/api/measurements', api), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { kind: 'failed', reason: describeNetworkError(error) };
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (response.status == 201) {
    const measurement = measurementSchema.safeParse(body);
    return measurement.success
      ? { kind: 'stored', measurement: measurement.data }
      : { kind: 'failed', reason: 'unexpected response' };
  }
  const problem = problemSchema.safeParse(body);
  return {
    kind: 'rejected',
    status: response.status,
    detail:
      (problem.success ? problem.data.detail : undefined) ??
      response.statusText,
  };
}
