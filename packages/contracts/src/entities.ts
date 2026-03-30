/**
 * Canonical entity schemas for the Personal Ops hero loop.
 */

import type { z } from 'zod';

import { CaptureResultSchema } from './capture';
import { InboxItemSchema } from './inbox';
import { PlanSchema } from './plan';
import { ReminderSchema } from './reminder';
import { ReviewPayloadSchema } from './review';

export const HeroLoopEntitySchemas = {
  capture: CaptureResultSchema,
  inbox: InboxItemSchema,
  plan: PlanSchema,
  reminder: ReminderSchema,
  review: ReviewPayloadSchema,
} as const;

export type HeroLoopEntitySchemaMap = typeof HeroLoopEntitySchemas;
export type HeroLoopEntityName = keyof HeroLoopEntitySchemaMap;
export type HeroLoopEntityValue<TName extends HeroLoopEntityName> = z.infer<
  HeroLoopEntitySchemaMap[TName]
>;
