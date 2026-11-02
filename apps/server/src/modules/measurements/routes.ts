import {
  measurementInputSchema,
  measurementSchema,
  type Measurement,
} from '@iot-sensor/shared';
import type { App, AppDeps } from '../../app.ts';
import { getSensorAuth, requireApiKey } from '../sensors/authenticate.ts';
import { recordMeasurement } from './service.ts';
import { HttpError } from '../../http-error.ts';

export function measurementRoutes(app: App, { db }: AppDeps): void {
  app.post(
    '/api/measurements',
    {
      onRequest: requireApiKey(db),
      schema: {
        body: measurementInputSchema,
        response: { 201: measurementSchema },
      },
    },
    async (request, reply) => {
      const sensor = getSensorAuth(request);
      let created: Measurement;
      try {
        created = await recordMeasurement(db, sensor, request.body);
      } catch (error) {
        if (error instanceof HttpError && error.statusCode === 422) {
          request.log.error(
            { ...sensor, ...request.body, reason: error.message },
            'Measurement rejected',
          );
        }
        throw error;
      }
      return reply
        .code(201)
        .header('location', `/api/measurements/${String(created.id)}`)
        .send(created);
    },
  );
}
