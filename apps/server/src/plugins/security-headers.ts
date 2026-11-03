import type { App } from '../app.ts';
import helmet from '@fastify/helmet';

export function securityHeaders(app: App): void {
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  });
}
