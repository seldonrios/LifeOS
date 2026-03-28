import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { create } from 'zustand';
import type { LoginRequest, UserProfile } from '@lifeos/contracts';

import { PUSH_TOKEN_KEY, registerPushToken } from './notifications';
import { useQueueStore } from './queue';
import { sdk } from './sdk';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SessionState = {
  status: SessionStatus;
  accessToken: string | null;
  user: UserProfile | null;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  restoreSession: () => Promise<void>;
  loadBiometricPreference: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  requireBiometric: () => Promise<void>;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
};

const REFRESH_TOKEN_KEY = 'lifeos.refresh_token';
const BIOMETRIC_ENABLED_KEY = 'lifeos.biometric_enabled';

function userFromAccessToken(accessToken: string): UserProfile {
  return {
    id: accessToken ? 'user_stub_001' : 'user_stub_anon',
    email: 'user@lifeos.local',
    displayName: 'LifeOS User',
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  biometricEnabled: false,
  biometricAvailable: false,
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
      try {
        await get().loadBiometricPreference();
      } catch {
        set({ biometricAvailable: false, biometricEnabled: false });
      }
    }
  },
  async loadBiometricPreference() {
    const [hasHardware, isEnrolled, storedValue] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
    ]);
    const biometricAvailable = hasHardware && isEnrolled;

    set({
      biometricAvailable,
      biometricEnabled: storedValue === 'true' && biometricAvailable,
    });
  },
  async setBiometricEnabled(enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, String(enabled));
    set({ biometricEnabled: enabled });
  },
  async requireBiometric() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock LifeOS',
      });

      if (!result.success) {
        await get().signOut();
      }
    } catch {
      await get().signOut();
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
      await Promise.allSettled([
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync(PUSH_TOKEN_KEY),
      ]);
    } catch {
      // Continue resetting in-memory session even when storage delete fails.
    } finally {
      useQueueStore.getState().clear();
      set({ status: 'unauthenticated', accessToken: null, user: null });
    }
  },
}));
