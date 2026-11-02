import type { FastifyRequest } from 'fastify';
import type { Db } from '../../db/client.ts';
import type { App } from '../../app.ts';
import { HttpError } from '../../http-error.ts';
import { hashToken } from '../auth/tokens.ts';
import { findActiveSensorByKeyHash } from './repository.ts';

export interface SensorContext {
  sensorId: number;
  seriesId: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    sensor: SensorContext | null;
  }
}

export function sensorAuthentication(app: App): void {
  app.decorateRequest('sensor', null);
}

export function requireApiKey(db: Db) {
  return async (request: FastifyRequest): Promise<void> => {
    const key = request.headers['x-api-key'];
    if (typeof key !== 'string' || key === '') {
      throw new HttpError(401, 'API key is required');
    }
    const sensor = await findActiveSensorByKeyHash(db, hashToken(key));
    if (!sensor) {
      throw new HttpError(401, 'Invalid API key');
    }
    request.sensor = {
      sensorId: sensor.id,
      seriesId: sensor.seriesId,
    };
  };
}

export function getSensorAuth(request: FastifyRequest): SensorContext {
  if (!request.sensor) {
    throw new HttpError(401, 'Sensor API key is required');
  }
  return request.sensor;
}
