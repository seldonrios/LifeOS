import type { AuditLogEntry, HomeStateChange, HouseholdCaptureStatusResponse, HouseholdContextSummary, HouseholdUpdateConfigRequest } from '@lifeos/contracts';
type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';
export interface HouseholdRow {
    id: string;
    name: string;
    created_at: string;
    config_json: string | null;
}
export interface HouseholdMemberRow {
    household_id: string;
    user_id: string;
    role: HouseholdRole;
    status: string;
    invited_by: string | null;
    joined_at: string | null;
    invite_token: string | null;
    invite_expires_at: string | null;
}
export interface ShoppingItemRow {
    id: string;
    list_id: string;
    household_id: string;
    title: string;
    status: 'added' | 'in_cart' | 'purchased';
    added_by_user_id: string;
    source: 'manual' | 'voice' | 'routine';
    created_at: string;
    purchased_at?: string | null;
}
export interface ShoppingListRow {
    id: string;
    household_id: string;
    name: string;
}
export interface CalendarRow {
    id: string;
    household_id: string;
    name: string;
    color: string;
}
export interface CalendarEventRow {
    id: string;
    calendar_id: string;
    title: string;
    start_at: string;
    end_at: string;
    status: 'confirmed' | 'tentative' | 'cancelled';
    recurrence_rule: string | null;
    reminder_at: string | null;
    attendee_user_ids_json: string;
}
export interface CalendarEventWithCalendarColorRow extends CalendarEventRow {
    calendar_color: string;
}
export interface ChoreRow {
    id: string;
    household_id: string;
    title: string;
    assigned_to_user_id: string;
    due_at: string;
    status: 'pending' | 'completed';
    recurrence_rule: string | null;
    assigned_to_json?: string | null;
    rotation_policy?: string | null;
    completed_by_user_id: string | null;
    completed_at: string | null;
    created_at: string;
}
export interface ChoreAssignmentRow {
    id: string;
    chore_id: string;
    assigned_to: string;
    due_at: string;
    status: string;
}
export interface ChoreRunRow {
    id: string;
    chore_id: string;
    completed_by: string;
    completed_at: string;
}
export interface ChoreWithDetail {
    id: string;
    title: string;
    recurrenceRule: string | null;
    assignedTo: {
        userId: string;
        displayName: string;
    };
    dueAt: string;
    status: 'pending' | 'overdue' | 'completed';
    streakCount: number;
    isOverdue: boolean;
}
export interface CompletedChoreRow extends ChoreRow {
    streakCount: number;
}
export interface ReminderRow {
    id: string;
    household_id: string;
    object_type: string;
    object_id: string;
    target_user_ids_json: string;
    remind_at: string;
    sensitive: number;
    created_at: string;
}
export interface ReminderListOptions {
    from?: string;
    to?: string;
    limit?: number;
}
export type ReminderAutomationErrorCode = 'REMINDER_NO_TOKEN' | 'REMINDER_QUIET_HOURS' | 'REMINDER_MEMBER_INACTIVE';
export interface ReminderAutomationFailure {
    targetUserId: string;
    errorCode: ReminderAutomationErrorCode;
    fixSuggestion: string;
    deliveryStatus: 'failed' | 'quiet_hours_suppressed';
}
export interface NoteRow {
    id: string;
    household_id: string;
    author_user_id: string;
    body: string;
    created_at: string;
}
export interface HomeStateLogRow {
    id: string;
    household_id: string;
    device_id: string;
    state_key: string;
    previous_value: string | null;
    new_value: string;
    source: 'ha_bridge' | 'manual' | 'routine';
    consent_verified: number;
    created_at: string;
}
export declare class InvalidShoppingItemTransitionError extends Error {
    readonly code = "INVALID_SHOPPING_ITEM_TRANSITION";
    constructor(currentStatus: string, nextStatus: string);
}
export declare class InvalidAttendeeError extends Error {
    readonly code = "INVALID_ATTENDEE";
    constructor(attendeeUserIds: string[]);
}
export declare class HouseholdGraphClient {
    private readonly db;
    constructor(dbPath?: string);
    initializeSchema(): void;
    private ensureFeatureSchema;
    private ensureColumn;
    private getOrCreateDefaultShoppingListId;
    createHousehold(name: string, configJson?: string): HouseholdRow;
    createHouseholdWithCreator(name: string, creatorUserId: string, role?: HouseholdRole, configJson?: string): {
        household: HouseholdRow;
        member: HouseholdMemberRow;
    };
    getHousehold(id: string): HouseholdRow | null;
    getHouseholdConfig(householdId: string): Record<string, unknown>;
    evaluateReminderAutomationFailures(householdId: string, targetUserIds: string[], remindAt: string): ReminderAutomationFailure[];
    updateHouseholdConfig(householdId: string, patch: HouseholdUpdateConfigRequest): HouseholdRow;
    addMember(householdId: string, userId: string, role: HouseholdRole, invitedBy: string): HouseholdMemberRow;
    updateMemberRole(householdId: string, userId: string, newRole: HouseholdRole): HouseholdMemberRow;
    suspendMember(householdId: string, userId: string): HouseholdMemberRow;
    storeInviteToken(householdId: string, userId: string, token: string, expiresAt: string): HouseholdMemberRow;
    acceptInvite(token: string, expectedHouseholdId?: string): HouseholdMemberRow;
    acceptInviteForUser(token: string, expectedHouseholdId: string, expectedUserId: string): HouseholdMemberRow;
    getMember(householdId: string, userId: string): HouseholdMemberRow | null;
    createCalendar(householdId: string, name: string, color: string): CalendarRow;
    listCalendars(householdId: string): CalendarRow[];
    getCalendar(householdId: string, calendarId: string): CalendarRow | null;
    createEvent(calendarId: string, householdId: string, title: string, startAt: string, endAt: string, status: 'confirmed' | 'tentative' | 'cancelled', recurrenceRule: string | null, reminderAt: string | null, attendeeUserIds: string[]): CalendarEventRow;
    listEvents(householdId: string, calendarId: string, from?: string, to?: string): CalendarEventWithCalendarColorRow[];
    getEvent(householdId: string, calendarId: string, eventId: string): CalendarEventRow | null;
    updateEvent(householdId: string, calendarId: string, eventId: string, patch: {
        title?: string;
        startAt?: string;
        endAt?: string;
        status?: 'confirmed' | 'tentative' | 'cancelled';
    }): CalendarEventRow;
    addShoppingItem(householdId: string, title: string, addedByUserId: string, source: 'manual' | 'voice' | 'routine', listId?: string, originalCaptureId?: string): ShoppingItemRow;
    updateShoppingItemStatus(householdId: string, itemId: string, newStatus: 'added' | 'in_cart' | 'purchased'): ShoppingItemRow;
    listShoppingLists(householdId: string): ShoppingListRow[];
    listShoppingItems(householdId: string, listId: string): ShoppingItemRow[];
    clearPurchasedItems(householdId: string, listId: string): void;
    getShoppingItem(householdId: string, itemId: string): ShoppingItemRow | null;
    createChore(householdId: string, title: string, assignedToUserId: string, dueAt: string, recurrenceRule?: string, originalCaptureId?: string): ChoreRow;
    listChores(householdId: string): ChoreWithDetail[];
    getChoreHistory(householdId: string, choreId: string): ChoreRunRow[];
    assignChore(householdId: string, choreId: string, userId: string, actorId: string, fromDate?: Date): ChoreAssignmentRow;
    completeChore(householdId: string, choreId: string, completedByUserId: string): CompletedChoreRow;
    getChore(householdId: string, choreId: string): ChoreRow | null;
    private assertChoreBelongsToHousehold;
    private assertActiveHouseholdMember;
    private assertValidActiveAttendees;
    private createChoreAssignmentRecord;
    private getCurrentAssignedUserId;
    private parseAssigneeRotation;
    private getChoreRuns;
    createReminder(householdId: string, objectType: string, objectId: string, targetUserIds: string[], remindAt: string, sensitive?: boolean): ReminderRow;
    listReminders(householdId: string, options?: ReminderListOptions): ReminderRow[];
    createNote(householdId: string, authorUserId: string, body: string): NoteRow;
    appendHomeStateLog(input: {
        householdId: string;
        deviceId: string;
        stateKey: string;
        previousValue: unknown;
        newValue: unknown;
        source: 'ha_bridge' | 'manual' | 'routine';
        consentVerified: boolean;
    }): HomeStateLogRow;
    listRecentHomeStateChanges(householdId: string, limit?: number): HomeStateChange[];
    getHouseholdContextSummary(householdId: string): HouseholdContextSummary;
    private toBooleanHomeState;
    private isActivityStateKey;
    private getNotificationRoutingMembers;
    private isWithinQuietHours;
    private parseClockMinutes;
    getCaptureStatus(householdId: string, captureId: string): HouseholdCaptureStatusResponse;
    writeRoutingLogEntry(householdId: string, captureId: string, status: 'pending' | 'resolved' | 'unresolved', resolvedAction?: string, objectId?: string): void;
    writeAuditEntry(entry: AuditLogEntry): void;
    close(): void;
}
export {};
