import type { App } from '../app.ts';

export function contentNegotiation(app: App): void {
  app.removeContentTypeParser('text/plain');
}
