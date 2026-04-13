import { z } from 'zod';
export declare const ReviewSessionSchema: z.ZodObject<{
    id: z.ZodString;
    period: z.ZodEnum<{
        daily: "daily";
        weekly: "weekly";
    }>;
    startedAt: z.ZodString;
    completedAt: z.ZodOptional<z.ZodString>;
    itemsReviewed: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ReviewSession = z.infer<typeof ReviewSessionSchema>;
