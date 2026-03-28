import { z } from 'zod';

import { IsoDateTimeSchema } from './shared';

export const ReminderEventSchema = z
  .object({
    id: z.string(),
    actionId: z.string(),
    scheduledFor: IsoDateTimeSchema,
    firedAt: IsoDateTimeSchema.optional(),
    status: z.enum(['scheduled', 'fired', 'acknowledged', 'cancelled']),
  })
  .strict();

export type ReminderEvent = z.infer<typeof ReminderEventSchema>;