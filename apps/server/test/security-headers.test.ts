import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { noDbDeps } from './helpers/app.ts';

describe('security headers', () => {
  const app = buildApp(noDbDeps());

  beforeAll(() => app.ready());
  afterAll(() => app.close());

  it.each([
    ['/api/health', 'application/json', 200],
    ['/api/health', 'application/xml', 406],
    ['/api/unknown', 'application/json', 404],
    ['/', 'text/html', 404],
  ])(
    'GET %s (Accept: %s) → %i carries nosniff and CSP',
    async (url, accept, status) => {
      const res = await app.inject({ method: 'GET', url, headers: { accept } });

      expect(res.statusCode).toBe(status);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeDefined();
    },
  );

  it('sends a CSP without inline or third-party sources', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const csp = String(res.headers['content-security-policy']);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self';");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toMatch(/\shttps:/);
  });
});
