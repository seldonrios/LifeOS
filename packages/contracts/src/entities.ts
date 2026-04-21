/**
 * Canonical entity schemas for the Personal Ops hero loop.
 */

import type { z } from 'zod';

import { CaptureEntrySchema } from './loop/capture-entry';
import { PlannedActionSchema } from './loop/planned-action';
import { ReminderEventSchema } from './loop/reminder-event';

export const HeroLoopEntitySchemas = {
  capture: CaptureEntrySchema,
  action: PlannedActionSchema,
  reminder: ReminderEventSchema,
} as const;

export type HeroLoopEntitySchemaMap = typeof HeroLoopEntitySchemas;
export type HeroLoopEntityName = keyof HeroLoopEntitySchemaMap;
export type HeroLoopEntityValue<TName extends HeroLoopEntityName> = z.infer<
  HeroLoopEntitySchemaMap[TName]
>;
