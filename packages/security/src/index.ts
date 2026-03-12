export * from './types';

import type { JwtPayload, SecurityClient, ServiceToken } from './types';

export class JwtService {
  async issue(payload: {
    sub: string;
    service_id: string;
    module_id?: string;
    scopes: string[];
  }): Promise<ServiceToken> {
    void payload;
    throw new Error('JwtService.issue is not implemented');
  }

  async verify(token: string): Promise<JwtPayload | null> {
    void token;
    throw new Error('JwtService.verify is not implemented');
  }
}

export function createSecurityClient(): SecurityClient {
  throw new Error('createSecurityClient is not implemented.');
}
