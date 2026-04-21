/**
 * Review contracts for daily and weekly reflection loops.
 */
import { z } from 'zod';
export declare const ReviewPeriodSchema: z.ZodEnum<{
    daily: "daily";
    weekly: "weekly";
}>;
export type ReviewPeriod = z.infer<typeof ReviewPeriodSchema>;
export declare const ReviewSourceSchema: z.ZodEnum<{
    heuristic: "heuristic";
    llm: "llm";
    manual: "manual";
}>;
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;
export declare const ReviewLoopSummarySchema: z.ZodObject<{
    pendingCaptures: z.ZodNumber;
    actionsDueToday: z.ZodNumber;
    unacknowledgedReminders: z.ZodNumber;
    completedActions: z.ZodArray<z.ZodString>;
    suggestedNextActions: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type ReviewLoopSummary = z.infer<typeof ReviewLoopSummarySchema>;
export declare const ReviewReportSchema: z.ZodObject<{
    period: z.ZodEnum<{
        daily: "daily";
        weekly: "weekly";
    }>;
    wins: z.ZodArray<z.ZodString>;
    nextActions: z.ZodArray<z.ZodString>;
    history: z.ZodOptional<z.ZodArray<z.ZodString>>;
    loopSummary: z.ZodObject<{
        pendingCaptures: z.ZodNumber;
        actionsDueToday: z.ZodNumber;
        unacknowledgedReminders: z.ZodNumber;
        completedActions: z.ZodArray<z.ZodString>;
        suggestedNextActions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    generatedAt: z.ZodString;
    source: z.ZodEnum<{
        heuristic: "heuristic";
        llm: "llm";
        manual: "manual";
    }>;
}, z.core.$strict>;
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
export declare const ReviewPayloadSchema: z.ZodObject<{
    period: z.ZodEnum<{
        daily: "daily";
        weekly: "weekly";
    }>;
    wins: z.ZodArray<z.ZodString>;
    nextActions: z.ZodArray<z.ZodString>;
    history: z.ZodOptional<z.ZodArray<z.ZodString>>;
    loopSummary: z.ZodObject<{
        pendingCaptures: z.ZodNumber;
        actionsDueToday: z.ZodNumber;
        unacknowledgedReminders: z.ZodNumber;
        completedActions: z.ZodArray<z.ZodString>;
        suggestedNextActions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    generatedAt: z.ZodString;
    source: z.ZodEnum<{
        heuristic: "heuristic";
        llm: "llm";
        manual: "manual";
    }>;
}, z.core.$strict>;
export type ReviewPayload = ReviewReport;
//# sourceMappingURL=review.d.ts.map