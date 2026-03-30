import type { FastifyRequest } from 'fastify';

import { JwtService } from '@lifeos/security';

const jwtService = new JwtService();

export async function extractCallerUserId(request: FastifyRequest): Promise<string | null> {
  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    return null;
  }

  const token = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : authorizationHeader.trim();

  if (!token) {
    return null;
  }

  const payload = await jwtService.verify(token);
  if (!payload || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return null;
  }

  return payload.sub;
}
