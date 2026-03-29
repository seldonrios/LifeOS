import { z } from 'zod';

import { DateOnlySchema, IsoDateTimeSchema } from './shared';

export const PlannedActionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    dueDate: DateOnlySchema.optional(),
    reminderAt: IsoDateTimeSchema.optional(),
    completedAt: IsoDateTimeSchema.optional(),
    status: z.enum(['todo', 'done', 'deferred']),
    goalId: z.string().min(1).optional(),
    sourceCapture: z.string().min(1).optional(),
  })
  .strict();

export type PlannedAction = z.infer<typeof PlannedActionSchema>;