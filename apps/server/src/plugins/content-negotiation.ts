import type { App } from '../app.ts';
import { HttpError } from '../http-error.ts';

const JSON_MEDIA_RANGES = new Set([
  '*/*',
  'application/*',
  'application/json',
  'application/problem+json',
]);

function isNegotiated(url: string): boolean {
  const path = url.split('?', 1)[0] ?? '';
  return path.startsWith('/api/') && path !== '/api/stream';
}

function acceptJson(accept: string | undefined): boolean {
  if (accept === undefined || accept.trim() === '') return true;
  return accept.split(',').some((range) => {
    const [type = '', ...params] = range
      .split(';')
      .map((part) => part.trim().toLowerCase());

    const refused = params.some((param) => /^q=0(\.0{0,3})?$/.test(param));
    return JSON_MEDIA_RANGES.has(type) && !refused;
  });
}

export function contentNegotiation(app: App): void {
  app.removeContentTypeParser('text/plain');

  app.addHook('onRequest', (request, _reply, done) => {
    if (isNegotiated(request.url) && !acceptJson(request.headers.accept)) {
      done(new HttpError(406, 'Not Acceptable'));
      return;
    }
    done();
  });
}
