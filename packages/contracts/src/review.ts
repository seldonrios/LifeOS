/**
 * Review contracts for daily and weekly reflection loops.
 */

import { z } from 'zod';

export const ReviewPeriodSchema = z.enum(['daily', 'weekly']);
export type ReviewPeriod = z.infer<typeof ReviewPeriodSchema>;

export const ReviewSourceSchema = z.enum(['heuristic', 'llm', 'manual']);
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;

export const ReviewLoopSummarySchema = z
  .object({
    pendingCaptures: z.number().int().nonnegative(),
    actionsDueToday: z.number().int().nonnegative(),
    unacknowledgedReminders: z.number().int().nonnegative(),
    blockedActions: z.number().int().nonnegative().optional(),
    deferredActions: z.number().int().nonnegative().optional(),
    completedActions: z.array(z.string().min(1)),
    suggestedNextActions: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ReviewLoopSummary = z.infer<typeof ReviewLoopSummarySchema>;

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
export type ReviewReport = z.infer<typeof ReviewReportSchema>;

export const ReviewPayloadSchema = ReviewReportSchema;
export type ReviewPayload = ReviewReport;
