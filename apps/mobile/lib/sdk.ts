import Constants from 'expo-constants';
import { LifeOSClient } from '@lifeos/sdk';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

function loadSessionStore() {
  return require('./session') as typeof import('./session');
}

export const sdk = new LifeOSClient({
  baseUrl: extra?.apiUrl ?? 'http://localhost:3005',
  getAccessToken: () => loadSessionStore().useSessionStore.getState().accessToken,
  onAuthExpired: () => {
    void loadSessionStore().useSessionStore.getState().signOut();
  },
});
