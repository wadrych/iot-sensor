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
import { problemDetails } from './plugins/problem-details.ts';

export interface AppDeps {
  db: Db;
}

export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  problemDetails(app);
  app.register(cookie);
  app.register(healthRoutes);
  app.register(authRoutes, deps);
  return app;
}

export type App = ReturnType<typeof buildApp>;
