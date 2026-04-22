/**
 * Stable public SDK surface for LifeOS module authors.
 *
 * Stable for module authors:
 * - `LifeOSModule`, `ModuleRuntimeContext` — the core authoring interface and runtime context
 * - `Topics`, `BaseEvent` — event bus constants and base event type
 * - `registerModuleSchema` — utility to register a module's graph schema
 * - `CaptureEntry`, `PlannedAction`, `ReminderEvent` and their Zod schemas — hero-loop contract types
 * - All `Household*` schemas and types — household event contracts
 *
 * Loader-internal coupling note:
 * - `ModuleRuntimeContext` is re-exported from `@lifeos/module-loader` and may evolve across
 *   platform versions; module authors should consume it only through `@lifeos/module-sdk`.
 * - `ModuleManifest` in `packages/module-loader/src/types.ts` is not part of this SDK surface;
 *   it is a future/internal type marked `@future`.
 *
 * @see docs/community/module-authoring-guide.md
 */
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

type RegisterModuleSchemaInput = Parameters<
  ReturnType<ModuleRuntimeContext['createLifeGraphClient']>['registerModuleSchema']
>[0];

export type { BaseEvent } from '@lifeos/event-bus';
export { Topics } from '@lifeos/event-bus';

export type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

export async function registerModuleSchema(
  context: ModuleRuntimeContext,
  schema: RegisterModuleSchemaInput,
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
  PlannedActionSchema,
  ReminderEventSchema,
  type CaptureEntry,
  type PlannedAction,
  type ReminderEvent,
} from '@lifeos/contracts';

export {
  HouseholdRoleSchema,
  HouseholdMemberStatusSchema,
  ChoreStatusSchema,
  ShoppingItemStatusSchema,
  HouseholdMemberInvitedSchema,
  HouseholdMemberJoinedSchema,
  HouseholdMemberRoleChangedSchema,
  HouseholdChoreAssignedSchema,
  HouseholdChoreCompletedSchema,
  HouseholdShoppingItemAddedSchema,
  HouseholdShoppingItemPurchasedSchema,
  HouseholdCalendarEventCreatedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  HouseholdShoppingItemAddRequestedSchema,
  HouseholdChoreCreateRequestedSchema,
  HouseholdReminderCreateRequestedSchema,
  HouseholdNoteCreateRequestedSchema,
  HouseholdCaptureUnresolvedSchema,
  HouseholdAutomationFailedSchema,
  HouseholdHomeStateChangedSchema,
  HouseholdReminderFiredSchema,
  AuditLogEntrySchema,
  type HouseholdRole,
  type HouseholdMemberStatus,
  type ChoreStatus,
  type ShoppingItemStatus,
  type HouseholdMemberInvited,
  type HouseholdMemberJoined,
  type HouseholdMemberRoleChanged,
  type HouseholdChoreAssigned,
  type HouseholdChoreCompleted,
  type HouseholdShoppingItemAdded,
  type HouseholdShoppingItemPurchased,
  type HouseholdCalendarEventCreated,
  type HouseholdVoiceCaptureCreated,
  type HouseholdShoppingItemAddRequested,
  type HouseholdChoreCreateRequested,
  type HouseholdReminderCreateRequested,
  type HouseholdNoteCreateRequested,
  type HouseholdCaptureUnresolved,
  type HouseholdAutomationFailed,
  type HouseholdHomeStateChanged,
  type HouseholdReminderFired,
  type AuditLogEntry,
} from '@lifeos/contracts';
