/**
 * Authentication-related types for the LifeOS mobile SDK.
 */
import { z } from 'zod';
export const LoginRequestSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
});
