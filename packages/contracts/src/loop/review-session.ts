import { z } from 'zod';

import { IsoDateTimeSchema } from './shared';

export const ReviewSessionSchema = z
  .object({
    id: z.string(),
    period: z.enum(['daily', 'weekly']),
    startedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema.optional(),
    itemsReviewed: z.array(z.string()),
  })
  .strict();

export type ReviewSession = z.infer<typeof ReviewSessionSchema>;