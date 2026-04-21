/**
 * Shared error contracts.
 */
import { z } from 'zod';
export const KnownLifeOSErrorCodeSchema = z.enum([
    'CAPTURE_PARSE_FAILED',
    'INBOX_CLASSIFY_FAILED',
    'PLAN_GENERATION_FAILED',
    'REMINDER_SCHEDULE_FAILED',
    'REVIEW_GENERATION_FAILED',
    'STORAGE_MIGRATION_REQUIRED',
]);
export const LifeOSErrorSchema = z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
});
//# sourceMappingURL=errors.js.map