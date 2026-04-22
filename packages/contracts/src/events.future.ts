/** Future/non-emitted hero-loop event contracts. These events are not published by the current CLI runtime. Do not import from this file in MVP consumer code. */

import { z } from 'zod';

import { InboxItemSchema } from './inbox';
import { PlanSchema } from './plan';
import { ReviewReportSchema } from './review';

export const FutureHeroLoopEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lifeos.inbox.item.created'),
    payload: InboxItemSchema,
  }),
  z.object({
    type: z.literal('lifeos.plan.created'),
    payload: PlanSchema,
  }),
  z.object({
    type: z.literal('lifeos.review.generated'),
    payload: ReviewReportSchema,
  }),
]);

export type FutureHeroLoopEvent = z.infer<typeof FutureHeroLoopEventSchema>;
