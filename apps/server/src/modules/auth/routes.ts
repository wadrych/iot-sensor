import { loginRequestSchema, loginResponseSchema } from '@iot-sensor/shared';
import type { App, AppDeps } from '../../app.ts';
import { login } from './service.ts';

export const SESSION_COOKIE = 'session';

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
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api',
        maxAge: expiresIn,
      });
      return { accessToken: token, tokenType: 'Bearer' as const, expiresIn };
    },
  );
}
