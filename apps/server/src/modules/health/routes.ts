import { healthResponseSchema } from '@iot-sensor/shared';
import type { App } from '../../app.ts';

export function healthRoutes(app: App): void {
  app.get(
    '/api/health',
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    () => ({ status: 'ok' as const }),
  );
}
