import type { ModuleRuntimeContext } from '@lifeos/module-loader';
import type { ModuleSchema } from '@lifeos/life-graph';

export type { BaseEvent } from '@lifeos/event-bus';
export { Topics } from '@lifeos/event-bus';

export type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';
export type { ModuleSchema, LifeGraphClient, LifeGraphHealthDailyStreak } from '@lifeos/life-graph';

export async function registerModuleSchema(
  context: ModuleRuntimeContext,
  schema: ModuleSchema,
): Promise<void> {
  const client = context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );
  await client.registerModuleSchema(schema);
}

export {
  CaptureEntrySchema,
  LoopInboxItemSchema,
  PlannedActionSchema,
  ReminderEventSchema,
  ReviewSessionSchema,
  type CaptureEntry,
  type LoopInboxItem,
  type PlannedAction,
  type ReminderEvent,
  type ReviewSession,
} from '@lifeos/contracts';
