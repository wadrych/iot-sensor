import { sensorCreatedSchema, sensorInputSchema } from '@iot-sensor/shared';
import type { App, AppDeps } from '../../app.ts';
import { requireAuth } from '../auth/authenticate.ts';
import { registerSensor } from './service.ts';

export function sensorRoutes(app: App, { db }: AppDeps): void {
  app.post(
    '/api/sensors',
    {
      onRequest: requireAuth(db),
      schema: {
        body: sensorInputSchema,
        response: {
          201: sensorCreatedSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await registerSensor(db, request.body);
      return reply
        .code(201)
        .header('location', `/api/sensors/${String(created.id)}`)
        .send(created);
    },
  );
}
