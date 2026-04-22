import { z } from 'zod';
export declare const PlannedActionSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    dueDate: z.ZodOptional<z.ZodString>;
    reminderAt: z.ZodOptional<z.ZodString>;
    completedAt: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        todo: "todo";
        done: "done";
        deferred: "deferred";
        blocked: "blocked";
        cancelled: "cancelled";
    }>;
    goalId: z.ZodOptional<z.ZodString>;
    sourceCapture: z.ZodOptional<z.ZodString>;
    planId: z.ZodOptional<z.ZodString>;
    activationSource: z.ZodOptional<z.ZodEnum<{
        capture_triage: "capture_triage";
        goal_projection: "goal_projection";
        manual: "manual";
        automation: "automation";
    }>>;
    blockedReason: z.ZodOptional<z.ZodString>;
    deferredUntil: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
//# sourceMappingURL=planned-action.d.ts.map