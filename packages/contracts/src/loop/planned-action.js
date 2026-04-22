import { z } from 'zod';
import { DateOnlySchema, IsoDateTimeSchema } from './shared';
export const PlannedActionSchema = z
    .object({
    id: z.string().min(1),
    title: z.string().min(1),
    dueDate: DateOnlySchema.optional(),
    reminderAt: IsoDateTimeSchema.optional(),
    completedAt: IsoDateTimeSchema.optional(),
    status: z.enum(['todo', 'done', 'deferred', 'blocked', 'cancelled']),
    goalId: z.string().min(1).optional(),
    sourceCapture: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    activationSource: z.enum(['capture_triage', 'goal_projection', 'manual', 'automation']).optional(),
    blockedReason: z.string().optional(),
    deferredUntil: IsoDateTimeSchema.optional(),
})
    .strict();
//# sourceMappingURL=planned-action.js.map