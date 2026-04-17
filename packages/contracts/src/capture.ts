/**
 * Data capture contracts shared across clients.
 */

import { z } from 'zod';

export const CaptureTypeSchema = z.enum(['text', 'voice']);
export type CaptureType = z.infer<typeof CaptureTypeSchema>;

export const CaptureRequestSchema = z.object({
  type: CaptureTypeSchema,
  content: z.string(),
  metadata: z
    .object({
      scope: z.literal('household').optional(),
      householdId: z.string().min(1).optional(),
      source: z.enum(['mobile', 'ha_satellite', 'ha_bridge']).optional(),
      sourceDeviceId: z.string().min(1).optional(),
      targetHint: z.enum(['shopping', 'chore', 'reminder', 'note', 'unknown']).optional(),
      audioBase64: z.string().optional(),
      durationMs: z.number().optional(),
    })
    .optional(),
  tags: z.array(z.string().min(1)).optional(),
});
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;
export type CaptureRequestMetadata = z.infer<
  NonNullable<typeof CaptureRequestSchema.shape.metadata>
>;

export const CaptureStatusSchema = z.enum(['success', 'pending', 'failed']);
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

export const CaptureResultSchema = z.object({
  id: z.string().min(1),
  type: CaptureTypeSchema,
  content: z.string().min(1),
  processedAt: z.number().int().nonnegative(),
  status: CaptureStatusSchema,
  error: z.string().min(1).optional(),
});
export type CaptureResult = z.infer<typeof CaptureResultSchema>;

export const CaptureListItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  type: z.string().min(1),
  capturedAt: z.string().min(1),
  source: z.string().min(1),
  tags: z.array(z.string()),
  status: z.string().min(1),
});
export type CaptureListItem = z.infer<typeof CaptureListItemSchema>;
