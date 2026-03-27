/**
 * Authentication-related types for the LifeOS mobile SDK.
 */

import { z } from 'zod';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
