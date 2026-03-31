import Constants from 'expo-constants';
import type { ReviewLoopSummary } from '@lifeos/contracts';
import { LifeOSClient } from '@lifeos/sdk';
import { sidecarGetDailyReview, sidecarCompleteAction } from './sidecar-bridge';

type HouseholdCaptureStatusResponse = {
  status: 'pending' | 'resolved' | 'unresolved';
  resolvedAction?: string;
  objectId?: string;
};

type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';

type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  status: string;
  invited_by: string | null;
  joined_at: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
};

type HouseholdRow = {
  id: string;
  name: string;
  created_at: string;
  config_json: string | null;
};

type HouseholdInviteLinkRow = {
  inviteToken: string;
  inviteUrl: string;
  role: HouseholdRole;
  expiresAt: string | null;
};

type ShoppingListRow = {
  id: string;
  household_id: string;
  name: string;
};

type ShoppingListItemRow = {
  id: string;
  title: string;
  addedBy: string;
  status: 'added' | 'in_cart' | 'purchased';
  addedAt: string;
  purchasedAt: string | null;
};

type ShoppingItemRow = {
  id: string;
  household_id: string;
  title: string;
  status: 'added' | 'in_cart' | 'purchased';
  added_by_user_id: string;
  source: 'manual' | 'voice' | 'routine';
  created_at: string;
  purchasedAt: string | null;
};

type ChoreDetailRow = {
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
};

type ChoreRow = {
  id: string;
  household_id: string;
  title: string;
  assigned_to_user_id: string;
  due_at: string;
  status: 'pending' | 'completed';
  recurrence_rule: string | null;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
};

type CalendarRow = {
  id: string;
  name: string;
  color: string;
};

type CalendarEventRow = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrenceRule: string | null;
  reminderAt: string | null;
  attendeeUserIds: string[];
  calendarColor: string;
};

type MobileSdkClient = LifeOSClient & {
  household: {
    listMembers(householdId: string): Promise<HouseholdMemberRow[]>;
    createHousehold(name: string): Promise<HouseholdRow>;
    inviteMember(
      householdId: string,
      invitedUserId: string,
      role: HouseholdRole,
    ): Promise<HouseholdMemberRow>;
    createInviteLink(householdId: string, role?: HouseholdRole): Promise<HouseholdInviteLinkRow>;
    addShoppingItem(
      householdId: string,
      title: string,
      source: 'manual' | 'voice' | 'routine',
    ): Promise<ShoppingItemRow>;
    createChore(
      householdId: string,
      title: string,
      assignedToUserId: string,
      dueAt: string,
      recurrenceRule?: string,
    ): Promise<ChoreRow>;
    shopping: {
      lists(householdId: string): Promise<ShoppingListRow[]>;
      items(householdId: string, listId: string): Promise<ShoppingListItemRow[]>;
      addItem(
        householdId: string,
        listId: string,
        title: string,
        source?: 'manual' | 'voice' | 'routine',
      ): Promise<ShoppingItemRow>;
      updateStatus(
        householdId: string,
        itemId: string,
        status: 'added' | 'in_cart' | 'purchased',
      ): Promise<ShoppingItemRow>;
    };
    chores: {
      list(householdId: string): Promise<ChoreDetailRow[]>;
      complete(householdId: string, choreId: string): Promise<ChoreRow>;
    };
    calendar: {
      list(householdId: string): Promise<CalendarRow[]>;
      events(
        householdId: string,
        calendarId: string,
        from?: string,
        to?: string,
      ): Promise<CalendarEventRow[]>;
      exportIcs(householdId: string, calendarId: string): Promise<string>;
    };
    captures: {
      status(householdId: string, captureId: string): Promise<HouseholdCaptureStatusResponse>;
    };
  };
};

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

function loadSessionStore() {
  return require('./session') as typeof import('./session');
}

function loadQueueStore() {
  return require('./queue') as typeof import('./queue');
}

export const sdk = new LifeOSClient({
  baseUrl: extra?.apiUrl ?? 'http://localhost:3000',
  getAccessToken: () => loadSessionStore().useSessionStore.getState().accessToken,
  onAuthExpired: () => {
    void loadSessionStore().useSessionStore.getState().signOut();
  },
}) as MobileSdkClient;

/**
 * Complete an action using sidecar IPC if available, otherwise fall back to HTTP.
 * On network/transient failures, enqueues for retry and resolves (not throws).
 * Only throws on unrecoverable errors (validation, auth, etc).
 */
export async function completeAction(actionId: string): Promise<void> {
  // Helper to check if an error is likely recoverable (network/transient)
  const isRecoverableError = (err: unknown): boolean => {
    if (err instanceof TypeError && err.message.includes('network')) return true;
    if (err instanceof Error && (err.message.includes('Network') || err.message.includes('timeout'))) return true;
    // ECONNREFUSED, ENOTFOUND, etc. from network operations
    if (err instanceof Error && /^E[A-Z]+/.test(err.message)) return true;
    return false;
  };

  try {
    const sidecarResult = await sidecarCompleteAction(actionId);
    if (sidecarResult !== null) {
      return;
    }
  } catch (sidecarError) {
    // Sidecar is available but the command failed.
    if (isRecoverableError(sidecarError)) {
      // Recoverable error - enqueue and resolve silently
      const { useQueueStore } = loadQueueStore();
      useQueueStore.getState().enqueue({
        type: 'complete_action',
        payload: { actionId },
        conflictPolicy: 'last-write-wins',
      });
      return; // Resolve successfully (queued)
    }
    // Unrecoverable error - propagate
    throw sidecarError;
  }

  // Tauri not available; try HTTP
  try {
    await sdk.inbox.completeAction(actionId);
  } catch (httpError) {
    // HTTP failed.
    if (isRecoverableError(httpError)) {
      // Recoverable error - enqueue and resolve silently
      const { useQueueStore } = loadQueueStore();
      useQueueStore.getState().enqueue({
        type: 'complete_action',
        payload: { actionId },
        conflictPolicy: 'last-write-wins',
      });
      return; // Resolve successfully (queued)
    }
    // Unrecoverable error - propagate
    throw httpError;
  }
}

/**
 * Get daily review using sidecar IPC if available, otherwise fall back to HTTP.
 */
export async function getDailyReview(): Promise<ReviewLoopSummary> {
  try {
    const sidecarResult = await sidecarGetDailyReview();
    if (sidecarResult !== null) {
      return sidecarResult;
    }
  } catch (sidecarError) {
    // Tauri is available but the command failed; propagate and let caller handle
    throw sidecarError;
  }

  // Tauri not available; fall back to HTTP
  return sdk.review.getDailyReview();
}
