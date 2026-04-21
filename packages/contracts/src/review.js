/**
 * Review contracts for daily and weekly reflection loops.
 */
import { z } from 'zod';
export const ReviewPeriodSchema = z.enum(['daily', 'weekly']);
export const ReviewSourceSchema = z.enum(['heuristic', 'llm', 'manual']);
export const ReviewLoopSummarySchema = z
    .object({
    pendingCaptures: z.number().int().nonnegative(),
    actionsDueToday: z.number().int().nonnegative(),
    unacknowledgedReminders: z.number().int().nonnegative(),
    completedActions: z.array(z.string().min(1)),
    suggestedNextActions: z.array(z.string().min(1)).optional(),
})
    .strict();
export const ReviewReportSchema = z
    .object({
    period: ReviewPeriodSchema,
    wins: z.array(z.string().min(1)),
    nextActions: z.array(z.string().min(1)),
    history: z.array(z.string().min(1)).optional(),
    loopSummary: ReviewLoopSummarySchema,
    generatedAt: z.string().min(1),
    source: ReviewSourceSchema,
})
    .strict();
export const ReviewPayloadSchema = ReviewReportSchema;
//# sourceMappingURL=review.js.map