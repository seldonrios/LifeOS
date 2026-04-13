/**
 * Canonical entity schemas for the Personal Ops hero loop.
 */
import { CaptureResultSchema } from './capture';
import { InboxItemSchema } from './inbox';
import { PlanSchema } from './plan';
import { ReminderSchema } from './reminder';
import { ReviewReportSchema } from './review';
const ReviewPayloadSchema = ReviewReportSchema;
export const HeroLoopEntitySchemas = {
    capture: CaptureResultSchema,
    inbox: InboxItemSchema,
    plan: PlanSchema,
    reminder: ReminderSchema,
    review: ReviewPayloadSchema,
};
