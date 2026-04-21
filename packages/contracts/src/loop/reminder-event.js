import { z } from 'zod';
import { IsoDateTimeSchema } from './shared';
export const ReminderEventSchema = z
    .object({
    id: z.string().min(1),
    actionId: z.string().min(1),
    scheduledFor: IsoDateTimeSchema,
    firedAt: IsoDateTimeSchema.optional(),
    status: z.enum(['scheduled', 'fired', 'acknowledged', 'cancelled']),
})
    .strict();
//# sourceMappingURL=reminder-event.js.map