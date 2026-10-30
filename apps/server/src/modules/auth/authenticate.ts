import type { FastifyRequest } from 'fastify';
import type { App } from '../../app.ts';
import type { Db } from '../../db/client.ts';
import { HttpError } from '../../http-error.ts';
import { findActiveSession } from './repository.ts';
import { hashToken } from './tokens.ts';

export const SESSION_COOKIE = 'session';

export interface AuthContext {
  userId: number;
  sessionId: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function authentication(app: App): void {
  app.decorateRequest('auth', null);
}

function readCredentials(
  request: FastifyRequest,
): { token: string; source: 'bearer' | 'cookie' } | undefined {
  const header = request.headers.authorization;
  if (header !== undefined) {
    const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
    return token === undefined ? undefined : { token, source: 'bearer' };
  }
  const cookie = request.cookies[SESSION_COOKIE];
  return cookie === undefined ? undefined : { token: cookie, source: 'cookie' };
}

function isSameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) {
    return false;
  }
  try {
    return new URL(origin).host == request.host;
  } catch {
    return false;
  }
}

export function requireAuth(db: Db) {
  return async (request: FastifyRequest): Promise<void> => {
    const credentials = readCredentials(request);
    if (!credentials) {
      throw new HttpError(401, 'Authentication required');
    }
    const session = await findActiveSession(db, hashToken(credentials.token));
    if (!session) {
      throw new HttpError(401, 'Invalid or expired session');
    }

    if (
      credentials.source === 'cookie' &&
      !SAFE_METHODS.has(request.method) &&
      !isSameOrigin(request)
    ) {
      throw new HttpError(403, 'Cross-origin request rejected');
    }

    request.auth = { userId: session.userId, sessionId: session.id };
  };
}

export function getAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw new HttpError(401, 'Authentication required');
  }
  return request.auth;
}
