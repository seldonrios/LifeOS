import { z } from 'zod';

import { IsoDateTimeSchema } from './shared';

export const CaptureEntrySchema = z
  .object({
    id: z.string().min(1),
    content: z.string().min(1),
    type: z.enum(['text', 'voice']),
    capturedAt: IsoDateTimeSchema,
    source: z.string().min(1),
    tags: z.array(z.string()),
    status: z.enum(['pending', 'triaged']),
  })
  .strict();

export type CaptureEntry = z.infer<typeof CaptureEntrySchema>;