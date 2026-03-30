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
    metadata: z
      .object({
        scope: z.literal('household').optional(),
        householdId: z.string().min(1).optional(),
        source: z.enum(['mobile', 'ha_satellite', 'ha_bridge']).optional(),
        sourceDeviceId: z.string().min(1).optional(),
        targetHint: z.enum(['shopping', 'chore', 'reminder', 'note', 'unknown']).optional(),
      })
      .optional(),
  })
  .strict();

export type CaptureEntry = z.infer<typeof CaptureEntrySchema>;