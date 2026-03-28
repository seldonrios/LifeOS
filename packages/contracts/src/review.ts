/**
 * Review contracts for daily and weekly reflection loops.
 */

import { z } from 'zod';

export const ReviewPeriodSchema = z.enum(['daily', 'weekly']);
export type ReviewPeriod = z.infer<typeof ReviewPeriodSchema>;

export const ReviewSourceSchema = z.enum(['heuristic', 'llm', 'manual']);
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;

export const ReviewReportSchema = z.object({
  period: ReviewPeriodSchema,
  wins: z.array(z.string().min(1)),
  nextActions: z.array(z.string().min(1)),
  generatedAt: z.string().min(1),
  source: ReviewSourceSchema,
});
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
