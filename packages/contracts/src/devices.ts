/**
 * Trusted device types for account session management.
 */

export interface DeviceInfo {
  id: string;
  label: string;
  platform: 'ios' | 'android' | 'web' | 'desktop';
  registeredAt: string;
  isCurrentDevice: boolean;
}

export interface RevokeDeviceRequest {
  deviceId: string;
}
