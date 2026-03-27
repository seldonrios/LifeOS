/**
 * Authentication-related types for the LifeOS mobile SDK.
 */

export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfile;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  deviceType: 'ios' | 'android';
  osVersion: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  preferences?: Record<string, unknown>;
}
