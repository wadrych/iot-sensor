import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Db } from './db/client.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { seriesRoutes } from './modules/series/routes.ts';
import { sensorRoutes } from './modules/sensors/routes.ts';
import { problemDetails } from './plugins/problem-details.ts';
import { authentication } from './modules/auth/authenticate.ts';
import { measurementRoutes } from './modules/measurements/routes.ts';
import rateLimit from '@fastify/rate-limit';
import { sensorAuthentication } from './modules/sensors/authenticate.ts';
import { contentNegotiation } from './plugins/content-negotiation.ts';
import { securityHeaders } from './plugins/security-headers.ts';

export interface AppDeps {
  db: Db;
}

export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  securityHeaders(app);
  problemDetails(app);
  contentNegotiation(app);
  app.register(cookie);
  authentication(app);
  sensorAuthentication(app);
  app.register(rateLimit, {
    global: false,
    onExceeded: (request, key) => {
      request.log.warn({ key, ips: request.ips }, 'Rate limit exceeded');
    },
  });
  app.register(healthRoutes);
  app.register(authRoutes, deps);
  app.register(seriesRoutes, deps);
  app.register(sensorRoutes, deps);
  app.register(measurementRoutes, deps);
  return app;
}

export type App = ReturnType<typeof buildApp>;
