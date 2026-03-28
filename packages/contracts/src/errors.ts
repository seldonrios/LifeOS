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
export type KnownLifeOSErrorCode = z.infer<typeof KnownLifeOSErrorCodeSchema>;

export const LifeOSErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});
export type LifeOSError = z.infer<typeof LifeOSErrorSchema>;
