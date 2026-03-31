import type { FastifyRequest } from 'fastify';

import { createSecurityClient, type AuthContext } from '@lifeos/security';

const securityClient = createSecurityClient();

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const token = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : authorizationHeader.trim();

  return token || null;
}

export async function extractAuthContext(request: FastifyRequest): Promise<AuthContext | null> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    return null;
  }

  return securityClient.getAuthContext(token);
}

export async function extractCallerUserId(request: FastifyRequest): Promise<string | null> {
  const authContext = await extractAuthContext(request);
  if (!authContext || !authContext.subject) {
    return null;
  }

  return authContext.subject.trim() || null;
}
