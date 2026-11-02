import {
  sensorCreatedSchema,
  sensorInputSchema,
  sensorSchema,
} from '@iot-sensor/shared';
import { getAllSensors, getSensor, registerSensor } from './service.ts';
import { z } from 'zod';
import type { App, AppDeps } from '../../app.ts';
import { requireAuth } from '../auth/authenticate.ts';
import { parseId } from '../../path-id.ts';

const sensorParams = z.object({ sensorId: z.string() });

export function sensorRoutes(app: App, { db }: AppDeps): void {
  app.get(
    '/api/sensors',
    {
      onRequest: requireAuth(db),
      schema: { response: { 200: z.array(sensorSchema) } },
    },
    () => getAllSensors(db),
  );

  app.get(
    '/api/sensors/:sensorId',
    {
      onRequest: requireAuth(db),
      schema: {
        params: sensorParams,
        response: { 200: sensorSchema },
      },
    },
    (request) => getSensor(db, parseId(request.params.sensorId, 'Sensor')),
  );

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
