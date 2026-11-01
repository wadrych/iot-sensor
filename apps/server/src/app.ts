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
import { problemDetails } from './plugins/problem-details.ts';
import { authentication } from './modules/auth/authenticate.ts';
import rateLimit from '@fastify/rate-limit';

export interface AppDeps {
  db: Db;
}

export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  problemDetails(app);
  app.register(cookie);
  authentication(app);
  app.register(rateLimit, {
    global: false,
    onExceeded: (request, key) => {
      request.log.warn({ key, ips: request.ips }, 'Rate limit exceeded');
    },
  });
  app.register(healthRoutes);
  app.register(authRoutes, deps);
  app.register(seriesRoutes, deps);
  return app;
}

export type App = ReturnType<typeof buildApp>;
