import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { sdk } from './sdk';

const DEVICE_ID_KEY = 'lifeos.device_id';
export const PUSH_TOKEN_KEY = 'lifeos.push_token';

type PushPlatform = 'ios' | 'android';

function resolvePlatform(): PushPlatform | null {
  const platform = Platform.OS;
  if (platform === 'ios' || platform === 'android') {
    return platform;
  }
  return null;
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

export async function registerPushToken(): Promise<void> {
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;

    if (!token) {
      return;
    }

    const platform = resolvePlatform();
    if (!platform) {
      return;
    }

    const deviceId = await getOrCreateDeviceId();
    const deviceLabel = Device.deviceName;
    void deviceLabel;

    const cachedToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (cachedToken === token) {
      return;
    }

    await sdk.notifications.registerPushToken({
      token,
      platform,
      deviceId,
    });

    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  } catch (error) {
    console.warn('Push token registration failed', error);
  }
}