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
    }>;
    goalId: z.ZodOptional<z.ZodString>;
    sourceCapture: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
//# sourceMappingURL=planned-action.d.ts.map