import { z } from 'zod';

import { DateOnlySchema, IsoDateTimeSchema } from './shared';

export const PlannedActionSchema = z
  .object({
    id: z.string(),
    title: z.string().min(1),
    dueDate: DateOnlySchema.optional(),
    reminderAt: IsoDateTimeSchema.optional(),
    status: z.enum(['todo', 'done', 'deferred']),
    goalId: z.string().optional(),
    sourceCapture: z.string().optional(),
  })
  .strict();

export type PlannedAction = z.infer<typeof PlannedActionSchema>;