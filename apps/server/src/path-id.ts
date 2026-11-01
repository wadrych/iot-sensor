import { HttpError } from './http-error.ts';

const MAX_DB_INTEGER = 2_147_483_647;

export function parseId(raw: string, resource: string): number {
  const id = /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id > MAX_DB_INTEGER) {
    throw new HttpError(404, `${resource} not found`);
  }
  return id;
}
