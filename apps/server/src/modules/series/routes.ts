import { seriesSchema, seriesInputSchema } from '@iot-sensor/shared';
import { z } from 'zod';
import type { App, AppDeps } from '../../app.ts';
import { requireAuth } from '../auth/authenticate.ts';
import { parseId } from '../../path-id.ts';
import {
  createSeries,
  getAllSeries,
  getSeries,
  replaceSeries,
  removeSeries,
} from './service.ts';

const seriesParams = z.object({ seriesId: z.string() });

export function seriesRoutes(app: App, { db }: AppDeps): void {
  app.get(
    '/api/series',
    { schema: { response: { 200: z.array(seriesSchema) } } },
    () => getAllSeries(db),
  );
  app.get(
    '/api/series/:seriesId',
    { schema: { params: seriesParams, response: { 200: seriesSchema } } },
    (request) => getSeries(db, parseId(request.params.seriesId, 'Series')),
  );
  app.post(
    '/api/series',
    {
      onRequest: requireAuth(db),
      schema: { body: seriesInputSchema, response: { 201: seriesSchema } },
    },
    async (request, reply) => {
      const created = await createSeries(db, request.body);
      return reply
        .code(201)
        .header('location', `/api/series/${String(created.id)}`)
        .send(created);
    },
  );
  app.put(
    '/api/series/:seriesId',
    {
      onRequest: requireAuth(db),
      schema: {
        params: seriesParams,
        body: seriesInputSchema,
        response: { 200: seriesSchema },
      },
    },
    (request) =>
      replaceSeries(
        db,
        parseId(request.params.seriesId, 'Series'),
        request.body,
      ),
  );
  app.delete(
    '/api/series/:seriesId',
    {
      onRequest: requireAuth(db),
      schema: { params: seriesParams },
    },
    async (request, reply) => {
      await removeSeries(db, parseId(request.params.seriesId, 'Series'));
      return reply.code(204).send();
    },
  );
}
