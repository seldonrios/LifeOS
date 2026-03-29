/**
 * Event envelope contracts for the Personal Ops hero loop.
 */

import { z } from 'zod';

import { CaptureResultSchema } from './capture';
import { InboxItemSchema } from './inbox';
import { PlanSchema } from './plan';
import { ReminderSchema } from './reminder';
import { ReviewReportSchema } from './review';

const ReviewPayloadSchema = ReviewReportSchema;

export const HeroLoopEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lifeos.capture.recorded'),
    timestamp: z.string().min(1),
    payload: CaptureResultSchema,
  }),
  z.object({
    type: z.literal('lifeos.inbox.item.created'),
    timestamp: z.string().min(1),
    payload: InboxItemSchema,
  }),
  z.object({
    type: z.literal('lifeos.plan.created'),
    timestamp: z.string().min(1),
    payload: PlanSchema,
  }),
  z.object({
    type: z.literal('lifeos.reminder.scheduled'),
    timestamp: z.string().min(1),
    payload: ReminderSchema,
  }),
  z.object({
    type: z.literal('lifeos.review.generated'),
    timestamp: z.string().min(1),
    payload: ReviewPayloadSchema,
  }),
]);

export type HeroLoopEvent = z.infer<typeof HeroLoopEventSchema>;
