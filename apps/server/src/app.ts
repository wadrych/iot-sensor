import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { healthRoutes } from './modules/health/routes.ts';
import { problemDetails } from './plugins/problem-details.ts';

export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  problemDetails(app);
  app.register(healthRoutes);
  return app;
}

export type App = ReturnType<typeof buildApp>;
