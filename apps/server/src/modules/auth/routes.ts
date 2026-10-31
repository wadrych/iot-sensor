import { loginRequestSchema, loginResponseSchema } from '@iot-sensor/shared';
import type { App, AppDeps } from '../../app.ts';
import { getAuth, requireAuth, SESSION_COOKIE } from './authenticate.ts';
import { login, logout } from './service.ts';

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api',
} as const;

export function authRoutes(app: App, { db }: AppDeps): void {
  app.post(
    '/api/auth/login',
    {
      schema: {
        body: loginRequestSchema,
        response: { 200: loginResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const { token, expiresIn } = await login(db, username, password);

      reply.setCookie(SESSION_COOKIE, token, {
        ...SESSION_COOKIE_OPTIONS,
        maxAge: expiresIn,
      });
      return { accessToken: token, tokenType: 'Bearer' as const, expiresIn };
    },
  );
  app.get(
    '/api/auth/session',
    {
      preHandler: requireAuth(db),
    },
    (_request, reply) => reply.code(204).send(),
  );
  app.post(
    '/api/auth/logout',
    {
      preHandler: requireAuth(db),
    },
    async (request, reply) => {
      await logout(db, getAuth(request).sessionId);
      reply.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
      return reply.code(204).send();
    },
  );
}
