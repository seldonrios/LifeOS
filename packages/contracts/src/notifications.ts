/**
 * Push notification-related types for the LifeOS mobile SDK.
 */

export interface PushTokenRegistration {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
}

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  route?: NotificationRoute;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface NotificationRoute {
  screen: string;
  params?: Record<string, unknown>;
}
