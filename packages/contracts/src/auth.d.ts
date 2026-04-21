/**
 * Authentication-related types for the LifeOS mobile SDK.
 */
import { z } from 'zod';
export interface UserProfile {
    id: string;
    email: string;
    displayName: string;
}
export declare const LoginRequestSchema: z.ZodObject<{
    email: z.ZodEmail;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}
//# sourceMappingURL=auth.d.ts.map