import { z } from 'zod';
export declare const LoopInboxItemSchema: z.ZodObject<{
    id: z.ZodString;
    captureId: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    stage: z.ZodLiteral<"inbox">;
    createdAt: z.ZodString;
    read: z.ZodBoolean;
    triageState: z.ZodEnum<{
        dismissed: "dismissed";
        untriaged: "untriaged";
        actioned: "actioned";
    }>;
}, z.core.$strict>;
export type LoopInboxItem = z.infer<typeof LoopInboxItemSchema>;
