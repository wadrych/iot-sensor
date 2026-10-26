import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const DATABASE_URL =
  'postgresql://user:secret@db.example.com/app?sslmode=require';

describe('loadConfig', () => {
  it('applies defaults for HOST and PORT', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      HOST: '127.0.0.1',
      PORT: 3000,
      DATABASE_URL,
    });
  });
  it('coerces PORT to a number', () => {
    expect(loadConfig({ DATABASE_URL, PORT: '4000' }).PORT).toBe(4000);
  });
  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
  it('rejects a non-Postgres URL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'http://example.com' })).toThrow(
      /DATABASE_URL/,
    );
  });
  it('rejects and invalid PORT', () => {
    expect(() => loadConfig({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
  });
});
