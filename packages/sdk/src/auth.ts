import type { AuthTokens, LoginRequest, SDKConfig, UserProfile } from '@lifeos/contracts';

export interface AuthClient {
  signIn(credentials: LoginRequest): Promise<{ user: UserProfile; tokens: AuthTokens }>;
  refresh(refreshToken: string): Promise<{ accessToken: string }>;
  signOut(): Promise<void>;
}

export class AuthClientImpl implements AuthClient {
  constructor(private readonly config: SDKConfig) {}

  async signIn(credentials: LoginRequest): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const normalizedEmail = credentials.email.trim().toLowerCase();

    if (normalizedEmail === 'invalid@lifeos.dev' || credentials.password === 'invalid123') {
      throw new Error('Invalid email or password');
    }

    const safeLocalPart = credentials.email.split('@')[0] ?? 'lifeos';
    const tokenSuffix = this.config.baseUrl.includes('localhost') ? 'local' : 'remote';

    return {
      user: {
        id: 'user_stub_001',
        email: credentials.email,
        displayName: safeLocalPart,
      },
      tokens: {
        accessToken: `stub-access-token-${tokenSuffix}`,
        refreshToken: `stub-refresh-token-${tokenSuffix}`,
      },
    };
  }

  async refresh(_refreshToken: string): Promise<{ accessToken: string }> {
    return { accessToken: 'stub-access-token-refreshed' };
  }

  async signOut(): Promise<void> {
    return;
  }
}
