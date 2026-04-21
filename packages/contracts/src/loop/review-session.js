import { z } from 'zod';
import { IsoDateTimeSchema } from './shared';
export const ReviewSessionSchema = z
    .object({
    id: z.string().min(1),
    period: z.enum(['daily', 'weekly']),
    startedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema.optional(),
    itemsReviewed: z.array(z.string().min(1)),
})
    .strict();
//# sourceMappingURL=review-session.js.map