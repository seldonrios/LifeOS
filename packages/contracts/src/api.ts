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
export type CaptureCreateRequest = z.infer<typeof CaptureCreateRequestSchema>;
export type CaptureCreateResponse = z.infer<typeof CaptureCreateResponseSchema>;

export const InboxListResponseSchema = z.array(InboxItemSchema);
export type InboxListResponse = z.infer<typeof InboxListResponseSchema>;

export const PlanCreateRequestSchema = PlanSchema;
export const PlanCreateResponseSchema = PlanSchema;
export type PlanCreateRequest = z.infer<typeof PlanCreateRequestSchema>;
export type PlanCreateResponse = z.infer<typeof PlanCreateResponseSchema>;

export const ReminderScheduleRequestSchema = ReminderSchema;
export const ReminderScheduleResponseSchema = ReminderSchema;
export type ReminderScheduleRequest = z.infer<typeof ReminderScheduleRequestSchema>;
export type ReminderScheduleResponse = z.infer<typeof ReminderScheduleResponseSchema>;

export const ReviewGenerateRequestSchema = z.object({
  period: ReviewPeriodSchema,
});
export const ReviewGenerateResponseSchema = ReviewPayloadSchema;
export type ReviewGenerateRequest = z.infer<typeof ReviewGenerateRequestSchema>;
export type ReviewGenerateResponse = z.infer<typeof ReviewGenerateResponseSchema>;

export const ApiErrorResponseSchema = z.object({
  error: LifeOSErrorSchema,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
