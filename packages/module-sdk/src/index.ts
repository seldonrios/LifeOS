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
  type HouseholdHomeStateChanged,
  type HouseholdReminderFired,
  type AuditLogEntry,
} from '@lifeos/contracts';
