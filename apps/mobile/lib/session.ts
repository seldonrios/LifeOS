import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { LoginRequest, UserProfile } from '@lifeos/contracts';

import { registerPushToken } from './notifications';
import { useQueueStore } from './queue';
import { sdk } from './sdk';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SessionState = {
  status: SessionStatus;
  accessToken: string | null;
  user: UserProfile | null;
  restoreSession: () => Promise<void>;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
};

const REFRESH_TOKEN_KEY = 'lifeos.refresh_token';

function userFromAccessToken(accessToken: string): UserProfile {
  return {
    id: accessToken ? 'user_stub_001' : 'user_stub_anon',
    email: 'user@lifeos.local',
    displayName: 'LifeOS User',
  };
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  async restoreSession() {
    let nextStatus: SessionStatus = 'unauthenticated';
    let nextAccessToken: string | null = null;
    let nextUser: UserProfile | null = null;

    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

      if (refreshToken) {
        try {
          const { accessToken } = await sdk.auth.refresh(refreshToken);

          nextStatus = 'authenticated';
          nextAccessToken = accessToken;
          nextUser = userFromAccessToken(accessToken);
        } catch {
          try {
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          } catch {
            // Ignore storage cleanup failures and continue to unauthenticated state.
          }
        }
      }
    } catch {
      // If SecureStore read fails, fall back to unauthenticated state.
    } finally {
      set({ status: nextStatus, accessToken: nextAccessToken, user: nextUser });
    }
  },
  async signIn(credentials) {
    const { user, tokens } = await sdk.auth.signIn(credentials);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);

    set({
      status: 'authenticated',
      accessToken: tokens.accessToken,
      user,
    });

    void registerPushToken();
  },
  async signOut() {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // Continue resetting in-memory session even when storage delete fails.
    } finally {
      useQueueStore.getState().clear();
      set({ status: 'unauthenticated', accessToken: null, user: null });
    }
  },
}));
