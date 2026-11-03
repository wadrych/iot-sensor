import {
  measurementInputSchema,
  measurementSchema,
  type Measurement,
} from '@iot-sensor/shared';
import { HttpError } from '../../http-error.ts';
import type { App, AppDeps } from '../../app.ts';
import { getSensorAuth, requireApiKey } from '../sensors/authenticate.ts';
import {
  getMeasurement,
  getMeasurements,
  recordMeasurement,
} from './service.ts';
import { MAX_DB_INTEGER, parseId } from '../../path-id.ts';
import { z } from 'zod';

const isoDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const measurementQuery = z.object({
  series: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .transform((list) => list.split(',').map(Number))
    .pipe(z.array(z.int().min(1).max(MAX_DB_INTEGER)))
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['timestamp', '-timestamp']).default('timestamp'),
  limit: z.coerce.number().int().min(1).max(10_000).default(1000),
});

const measurementParams = z.object({
  measurementId: z.string(),
});

export function measurementRoutes(app: App, { db }: AppDeps): void {
  app.get(
    '/api/measurements',
    {
      schema: {
        querystring: measurementQuery,
        response: { 200: z.array(measurementSchema) },
      },
    },
    (request) => {
      const { series, from, to, sort, limit } = request.query;
      return getMeasurements(db, {
        seriesIds: series,
        from,
        to,
        descending: sort === '-timestamp',
        limit,
      });
    },
  );
  app.get(
    '/api/measurements/:measurementId',
    {
      schema: {
        params: measurementParams,
        response: { 200: measurementSchema },
      },
    },
    (request) =>
      getMeasurement(db, parseId(request.params.measurementId, 'Measurement')),
  );

  app.route({
    method: ['PUT', 'PATCH', 'DELETE'],
    url: '/api/measurements/:measurementId',
    handler: (_request, reply) => {
      reply.header('allow', 'GET, HEAD');
      throw new HttpError(405, 'Method Not Allowed');
    },
  });

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
