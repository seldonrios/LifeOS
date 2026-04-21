import { z } from 'zod';
export declare const ReminderEventSchema: z.ZodObject<{
    id: z.ZodString;
    actionId: z.ZodString;
    scheduledFor: z.ZodString;
    firedAt: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        scheduled: "scheduled";
        fired: "fired";
        acknowledged: "acknowledged";
        cancelled: "cancelled";
    }>;
}, z.core.$strict>;
export type ReminderEvent = z.infer<typeof ReminderEventSchema>;
//# sourceMappingURL=reminder-event.d.ts.map