import { useEffect, useRef } from 'react';
import { AppState, ActivityIndicator, StyleSheet, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Slot, useSegments } from 'expo-router';
import { lightColors } from '@lifeos/ui';

import { queryClient } from '../lib/query-client';
import { useQueueStore } from '../lib/queue';
import { useSessionStore } from '../lib/session';

type NetworkState = { isConnected?: boolean | null };
type NetworkSubscription = { remove: () => void };

const Network = require('expo-network') as {
  addNetworkStateListener: (listener: (state: NetworkState) => void) => NetworkSubscription;
};

export default function RootLayout() {
  const status = useSessionStore((state) => state.status);
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';
  const inTabsGroup = segments[0] === '(tabs)';
  const inModalGroup = segments[0] === 'modal';
  const lastForegroundAt = useRef<number>(Date.now());

  useEffect(() => {
    void useSessionStore.getState().restoreSession();
  }, []);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        lastForegroundAt.current = Date.now();
      }

      if (nextAppState === 'active') {
        void useQueueStore.getState().flush();

        if (
          Date.now() - lastForegroundAt.current > 5 * 60_000 &&
          useSessionStore.getState().biometricEnabled === true
        ) {
          void useSessionStore.getState().requireBiometric();
        }
      }
    });

    let wasConnected = true;
    const networkSubscription = Network.addNetworkStateListener((state: NetworkState) => {
      const isConnected = Boolean(state.isConnected);
      if (!wasConnected && isConnected) {
        void useQueueStore.getState().flush();
      }
      wasConnected = isConnected;
    });

    return () => {
      appStateSubscription.remove();
      networkSubscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {status === 'loading' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={lightColors.accent.brand} />
        </View>
      ) : status === 'unauthenticated' ? (
        inAuthGroup ? (
          <Slot />
        ) : (
          <Redirect href="/(auth)/sign-in" />
        )
      ) : inTabsGroup || inModalGroup ? (
        <Slot />
      ) : (
        <Redirect href="/(tabs)/home" />
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background.primary,
  },
});
