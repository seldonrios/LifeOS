/**
 * API request/response contracts for the hero loop endpoints.
 */
import { z } from 'zod';
import { CaptureRequestSchema, CaptureResultSchema } from './capture';
import { LifeOSErrorSchema } from './errors';
import { InboxItemSchema } from './inbox';
import { PlanSchema } from './plan';
import { ReminderSchema } from './reminder';
import { ReviewPeriodSchema, ReviewReportSchema } from './review';
const ReviewPayloadSchema = ReviewReportSchema;
export const CaptureCreateRequestSchema = CaptureRequestSchema;
export const CaptureCreateResponseSchema = CaptureResultSchema;
export const InboxListResponseSchema = z.array(InboxItemSchema);
export const PlanCreateRequestSchema = PlanSchema;
export const PlanCreateResponseSchema = PlanSchema;
export const ReminderScheduleRequestSchema = ReminderSchema;
export const ReminderScheduleResponseSchema = ReminderSchema;
export const ReviewGenerateRequestSchema = z.object({
    period: ReviewPeriodSchema,
});
export const ReviewGenerateResponseSchema = ReviewPayloadSchema;
export const ApiErrorResponseSchema = z.object({
    error: LifeOSErrorSchema,
});
//# sourceMappingURL=api.js.map