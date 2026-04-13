/**
 * Shared error contracts.
 */
import { z } from 'zod';
export declare const KnownLifeOSErrorCodeSchema: z.ZodEnum<{
    CAPTURE_PARSE_FAILED: "CAPTURE_PARSE_FAILED";
    INBOX_CLASSIFY_FAILED: "INBOX_CLASSIFY_FAILED";
    PLAN_GENERATION_FAILED: "PLAN_GENERATION_FAILED";
    REMINDER_SCHEDULE_FAILED: "REMINDER_SCHEDULE_FAILED";
    REVIEW_GENERATION_FAILED: "REVIEW_GENERATION_FAILED";
    STORAGE_MIGRATION_REQUIRED: "STORAGE_MIGRATION_REQUIRED";
}>;
export type KnownLifeOSErrorCode = z.infer<typeof KnownLifeOSErrorCodeSchema>;
export declare const LifeOSErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    retryable: z.ZodBoolean;
}, z.core.$strip>;
export type LifeOSError = z.infer<typeof LifeOSErrorSchema>;
