export { Topics } from '@lifeos/event-bus';
export async function registerModuleSchema(context, schema) {
    const client = context.createLifeGraphClient(context.graphPath
        ? {
            graphPath: context.graphPath,
            env: context.env,
        }
        : {
            env: context.env,
        });
    await client.registerModuleSchema(schema);
}
export { CaptureEntrySchema, PlannedActionSchema, ReminderEventSchema, } from '@lifeos/contracts';
export { HouseholdRoleSchema, HouseholdMemberStatusSchema, ChoreStatusSchema, ShoppingItemStatusSchema, HouseholdMemberInvitedSchema, HouseholdMemberJoinedSchema, HouseholdMemberRoleChangedSchema, HouseholdChoreAssignedSchema, HouseholdChoreCompletedSchema, HouseholdShoppingItemAddedSchema, HouseholdShoppingItemPurchasedSchema, HouseholdCalendarEventCreatedSchema, HouseholdVoiceCaptureCreatedSchema, HouseholdShoppingItemAddRequestedSchema, HouseholdChoreCreateRequestedSchema, HouseholdReminderCreateRequestedSchema, HouseholdNoteCreateRequestedSchema, HouseholdCaptureUnresolvedSchema, HouseholdAutomationFailedSchema, HouseholdHomeStateChangedSchema, HouseholdReminderFiredSchema, AuditLogEntrySchema, } from '@lifeos/contracts';
