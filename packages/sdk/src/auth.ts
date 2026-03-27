import type { AuthTokens, LoginRequest, SDKConfig, UserProfile } from '@lifeos/contracts';
import { sendHttpRequest } from './http';

export interface AuthClient {
  signIn(credentials: LoginRequest): Promise<{ user: UserProfile; tokens: AuthTokens }>;
  refresh(refreshToken: string): Promise<{ accessToken: string }>;
  signOut(): Promise<void>;
}

export class AuthClientImpl implements AuthClient {
  constructor(private readonly config: SDKConfig) {}

  async signIn(credentials: LoginRequest): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const response = await sendHttpRequest<{ user: UserProfile; tokens: AuthTokens }>(
      {
        url: `${this.config.baseUrl}/api/auth/login`,
        method: 'POST',
        body: credentials,
      },
      () => null, // No auth header for login
      this.config
    );
    return response.data;
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const response = await sendHttpRequest<{ accessToken: string }>(
      {
        url: `${this.config.baseUrl}/api/auth/refresh`,
        method: 'POST',
        body: { refreshToken },
      },
      () => null, // No auth header for refresh
      this.config
    );
    return response.data;
  }

  async signOut(): Promise<void> {
    try {
      await sendHttpRequest(
        {
          url: `${this.config.baseUrl}/api/auth/logout`,
          method: 'POST',
        },
        this.config.getAccessToken,
        this.config
      );
    } catch {
      // Swallow all errors during logout
    }
  }
}
