import { z } from 'zod';
import { IsoDateTimeSchema } from './shared';
export const LoopInboxItemSchema = z
    .object({
    id: z.string().min(1),
    captureId: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    stage: z.literal('inbox'),
    createdAt: IsoDateTimeSchema,
    read: z.boolean(),
    triageState: z.enum(['untriaged', 'actioned', 'dismissed']),
})
    .strict();
