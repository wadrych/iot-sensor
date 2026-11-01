import { seriesSchema } from '@iot-sensor/shared';
import { z } from 'zod';
import type { App, AppDeps } from '../../app.ts';
import { parseId } from '../../path-id.ts';
import { getAllSeries, getSeries } from './service.ts';

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
}
