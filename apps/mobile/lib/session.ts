import AsyncStorage from '@react-native-async-storage/async-storage';
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
  householdId: string | null;
  onboardingComplete: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  setupStyle: string | null;
  useCases: string[] | null;
  assistantStyle: string | null;
  assistantName: string;
  restoreSession: () => Promise<void>;
  setOnboardingComplete: (completed: boolean) => void;
  setHouseholdId: (id: string) => Promise<void>;
  setAssistantName: (name: string) => Promise<void>;
  loadBiometricPreference: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  requireBiometric: () => Promise<void>;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
};

const REFRESH_TOKEN_KEY = 'lifeos.refresh_token';
const HOUSEHOLD_ID_KEY = 'lifeos.household_id';
const BIOMETRIC_ENABLED_KEY = 'lifeos.biometric_enabled';
export const ONBOARDING_COMPLETE_KEY = 'lifeos.onboarding_complete';
export const SETUP_STYLE_KEY = 'lifeos.setup_style';
export const USE_CASES_KEY = 'lifeos.use_cases';
export const ASSISTANT_STYLE_KEY = 'lifeos.assistant_style';
export const ASSISTANT_NAME_KEY = 'lifeos.assistant_name';
export const WAKE_PHRASE_KEY = 'lifeos.wake_phrase';

export async function isOnboardingComplete(): Promise<boolean> {
  const storedValue = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
  return storedValue === 'true';
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
}

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
  householdId: null,
  onboardingComplete: false,
  biometricEnabled: false,
  biometricAvailable: false,
  setupStyle: null,
  useCases: null,
  assistantStyle: null,
  assistantName: 'LifeOS',
  async restoreSession() {
    let nextStatus: SessionStatus = 'unauthenticated';
    let nextAccessToken: string | null = null;
    let nextUser: UserProfile | null = null;
    let nextHouseholdId: string | null = null;

    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

      if (refreshToken) {
        try {
          const { accessToken } = await sdk.auth.refresh(refreshToken);

          nextStatus = 'authenticated';
          nextAccessToken = accessToken;
          nextUser = userFromAccessToken(accessToken);
          nextHouseholdId = await SecureStore.getItemAsync(HOUSEHOLD_ID_KEY);
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
      set({
        status: nextStatus,
        accessToken: nextAccessToken,
        user: nextUser,
        householdId: nextHouseholdId,
      });
      try {
        await get().loadBiometricPreference();
      } catch {
        set({ biometricAvailable: false, biometricEnabled: false });
      }
      try {
        const storedName = await AsyncStorage.getItem(ASSISTANT_NAME_KEY);
        set({ assistantName: storedName ?? 'LifeOS' });
      } catch {
        set({ assistantName: 'LifeOS' });
      }
    }
  },
  async setHouseholdId(id) {
    await SecureStore.setItemAsync(HOUSEHOLD_ID_KEY, id);
    set({ householdId: id });
  },
  setOnboardingComplete(completed) {
    set({ onboardingComplete: completed });
  },
  async setAssistantName(name) {
    const trimmed = name.trim();
    const sanitized = trimmed.length >= 1 && trimmed.length <= 32 ? trimmed : 'LifeOS';
    await AsyncStorage.setItem(ASSISTANT_NAME_KEY, sanitized);
    set({ assistantName: sanitized });
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
        SecureStore.deleteItemAsync(HOUSEHOLD_ID_KEY),
        SecureStore.deleteItemAsync(PUSH_TOKEN_KEY),
      ]);
    } catch {
      // Continue resetting in-memory session even when storage delete fails.
    } finally {
      useQueueStore.getState().clear();
      set({ status: 'unauthenticated', accessToken: null, user: null, householdId: null });
    }
  },
}));
