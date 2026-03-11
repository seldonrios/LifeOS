export interface JwtPayload {
  sub: string;
  iss: string;
  aud?: string;
  exp: number;
  iat: number;
  scope?: string[];
}

export interface NKeyIdentity {
  publicKey: string;
  seedRef: string;
}

export interface ServiceToken {
  token: string;
  expiresAt: string;
}

export interface AuthContext {
  subject: string;
  scopes: string[];
  service?: string;
}

export interface SecurityClient {
  issueServiceToken(serviceName: string): Promise<ServiceToken>;
  verifyJwt(token: string): Promise<JwtPayload | null>;
  getAuthContext(token: string): Promise<AuthContext | null>;
}
