export interface JwtPayload {
  sub: string;
  service_id: string;
  module_id?: string;
  scopes: string[];
  iss: string;
  aud?: string;
  exp: number;
  iat: number;
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

export const Scopes = {
  goalRead: 'goal:read',
  goalWrite: 'goal:write',
  healthRead: 'health:read',
  policyCheck: 'policy:check',
  moduleInstall: 'module:install',
} as const;

export type NatsAuthConfig = {
  [serviceName: string]: {
    credsFile: string;
  };
};

export type JwtServiceConfig = {
  issuer: string;
  audience: string;
  secret: string;
  expiresInSeconds: number;
};
