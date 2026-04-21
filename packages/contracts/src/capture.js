/**
 * Data capture contracts shared across clients.
 */
import { z } from 'zod';
export const CaptureTypeSchema = z.enum(['text', 'voice']);
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
export const CaptureStatusSchema = z.enum(['success', 'pending', 'failed']);
export const CaptureResultSchema = z.object({
    id: z.string().min(1),
    type: CaptureTypeSchema,
    content: z.string().min(1),
    processedAt: z.number().int().nonnegative(),
    status: CaptureStatusSchema,
    error: z.string().min(1).optional(),
});
export const CaptureListItemSchema = z.object({
    id: z.string().min(1),
    content: z.string().min(1),
    type: z.string().min(1),
    capturedAt: z.string().min(1),
    source: z.string().min(1),
    tags: z.array(z.string()),
    status: z.string().min(1),
});
