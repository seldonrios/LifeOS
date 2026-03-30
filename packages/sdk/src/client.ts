/**
 * LifeOS SDK client for mobile applications.
 */

import type {
  SDKConfig,
  InboxItem,
  InboxListResponse,
  DeviceInfo,
  CaptureRequest,
  CaptureResult,
  TimelineEntry,
  GoalSummary,
  PushTokenRegistration,
  ReviewLoopSummary,
} from '@lifeos/contracts';
import { InboxListResponseSchema, ReviewLoopSummarySchema } from '@lifeos/contracts';
import { AuthClientImpl, type AuthClient } from './auth';
import { sendHttpRequest } from './http';

type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';
type ShoppingItemStatus = 'added' | 'in_cart' | 'purchased';

/**
 * Inbox namespace.
 */
class InboxNamespace {
  constructor(private config: SDKConfig) {}

  async list(): Promise<InboxItem[]> {
    const response = await sendHttpRequest<InboxListResponse>(
      {
        url: `${this.config.baseUrl}/api/inbox`,
        method: 'GET',
      },
      this.config.getAccessToken,
      this.config,
    );

    return InboxListResponseSchema.parse(response.data);
  }

  async approve(requestId: string): Promise<void> {
    await sendHttpRequest(
      {
        url: `${this.config.baseUrl}/api/inbox/approve`,
        method: 'POST',
        body: { requestId },
      },
      this.config.getAccessToken,
      this.config,
    );
  }

  async reject(requestId: string, reason?: string): Promise<void> {
    await sendHttpRequest(
      {
        url: `${this.config.baseUrl}/api/inbox/reject`,
        method: 'POST',
        body: { requestId, reason },
      },
      this.config.getAccessToken,
      this.config,
    );
  }

  async completeAction(actionId: string): Promise<void> {
    await sendHttpRequest(
      {
        url: `${this.config.baseUrl}/api/inbox/complete`,
        method: 'POST',
        body: { actionId },
      },
      this.config.getAccessToken,
      this.config,
    );
  }
}

/**
 * Capture namespace — stub implementations.
 */
class CaptureNamespace {
  constructor(private config: SDKConfig) {}

  async create(req: CaptureRequest): Promise<CaptureResult> {
    const response = await sendHttpRequest<CaptureResult>(
      {
        url: `${this.config.baseUrl}/api/capture`,
        method: 'POST',
        body: req,
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async search(query: string): Promise<CaptureResult[]> {
    void this.config;
    void query;
    return [];
  }
}

/**
 * Timeline namespace — stub implementations.
 */
class TimelineNamespace {
  constructor(private config: SDKConfig) {}

  async list(): Promise<TimelineEntry[]> {
    void this.config;
    const now = Date.now();

    return [
      {
        id: 'timeline_task_1',
        goalId: 'goal_focus',
        title: 'Write architecture draft',
        type: 'task',
        status: 'in-progress',
        dueDate: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
        priority: 1,
      },
      {
        id: 'timeline_task_2',
        goalId: 'goal_health',
        title: 'Strength training session',
        type: 'task',
        status: 'todo',
        dueDate: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        priority: 2,
      },
      {
        id: 'timeline_task_3',
        goalId: 'goal_focus',
        title: 'Review pull requests',
        type: 'task',
        status: 'done',
        dueDate: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        priority: 2,
      },
      {
        id: 'timeline_event_1',
        goalId: 'goal_relationships',
        title: 'Weekly family planning call',
        type: 'event',
        status: 'confirmed',
        start: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        end: new Date(now + 49 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }

  async goals(): Promise<GoalSummary[]> {
    void this.config;
    const now = Date.now();

    return [
      {
        id: 'goal_focus',
        title: 'Ship mobile planning flow',
        totalTasks: 8,
        completedTasks: 5,
        priority: 1,
        deadline: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'goal_fitness',
        title: 'Complete March strength block',
        totalTasks: 6,
        completedTasks: 2,
        priority: 2,
        deadline: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'goal_learning',
        title: 'Deepen systems design practice',
        totalTasks: 4,
        completedTasks: 3,
        priority: 3,
        deadline: null,
      },
    ];
  }
}

/**
 * Notifications namespace.
 */
class NotificationsNamespace {
  constructor(private config: SDKConfig) {}

  async registerPushToken(req: PushTokenRegistration): Promise<void> {
    await sendHttpRequest(
      {
        url: `${this.config.baseUrl}/api/devices/push-token`,
        method: 'POST',
        body: req,
      },
      this.config.getAccessToken,
      this.config,
    );
  }
}

/**
 * Review namespace.
 */
class ReviewNamespace {
  constructor(private config: SDKConfig) {}

  async getDailyReview(): Promise<ReviewLoopSummary> {
    const response = await sendHttpRequest<ReviewLoopSummary>(
      {
        url: `${this.config.baseUrl}/api/review/daily`,
        method: 'GET',
      },
      this.config.getAccessToken,
      this.config,
    );

    return ReviewLoopSummarySchema.parse(response.data);
  }
}

/**
 * Devices namespace.
 */
class DevicesNamespace {
  constructor(private config: SDKConfig) {}

  async list(): Promise<DeviceInfo[]> {
    void this.config;

    return [
      {
        id: 'device_iphone_15',
        label: 'iPhone 15 Pro',
        platform: 'ios',
        registeredAt: '2026-03-20T09:24:00.000Z',
        isCurrentDevice: true,
      },
      {
        id: 'device_pixel_8',
        label: 'Pixel 8',
        platform: 'android',
        registeredAt: '2026-02-11T17:10:00.000Z',
        isCurrentDevice: false,
      },
      {
        id: 'device_chrome_web',
        label: 'Chrome on Windows',
        platform: 'web',
        registeredAt: '2026-01-05T13:42:00.000Z',
        isCurrentDevice: false,
      },
    ];
  }

  async revoke(deviceId: string): Promise<void> {
    await sendHttpRequest(
      {
        url: `${this.config.baseUrl}/api/devices/revoke`,
        method: 'POST',
        body: { deviceId },
      },
      this.config.getAccessToken,
      this.config,
    );
  }
}

interface HouseholdRow {
  id: string;
  name: string;
  created_at: string;
  config_json: string | null;
}

interface HouseholdMemberRow {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  status: string;
  invited_by: string | null;
  joined_at: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
}

interface ShoppingListRow {
  id: string;
  household_id: string;
  name: string;
}

interface ShoppingItemRow {
  id: string;
  household_id: string;
  title: string;
  status: ShoppingItemStatus;
  added_by_user_id: string;
  source: 'manual' | 'voice' | 'routine';
  created_at: string;
  purchasedAt: string | null;
}

interface ShoppingListItemRow {
  id: string;
  title: string;
  addedBy: string;
  status: ShoppingItemStatus;
  addedAt: string;
  purchasedAt: string | null;
}

interface ChoreRow {
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
}

interface ChoreDetailRow {
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

interface ChoreRunRow {
  id: string;
  choreId: string;
  completedBy: string;
  completedAt: string;
}

interface ChoreAssignmentRow {
  id: string;
  chore_id: string;
  assigned_to: string;
  due_at: string;
  status: string;
}

interface ReminderRow {
  id: string;
  household_id: string;
  object_type: string;
  object_id: string;
  target_user_ids_json: string;
  remind_at: string;
  created_at: string;
}

interface NoteRow {
  id: string;
  household_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

class HouseholdNamespace {
  constructor(private config: SDKConfig) {}

  readonly chores = {
    list: async (householdId: string): Promise<ChoreDetailRow[]> => {
      const response = await sendHttpRequest<ChoreDetailRow[]>(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/chores`,
          method: 'GET',
        },
        this.config.getAccessToken,
        this.config,
      );

      return response.data;
    },
    complete: async (householdId: string, choreId: string): Promise<ChoreRow> => {
      const response = await sendHttpRequest<ChoreRow>(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/chores/${choreId}/complete`,
          method: 'PATCH',
        },
        this.config.getAccessToken,
        this.config,
      );

      return response.data;
    },
    assign: async (
      householdId: string,
      choreId: string,
      userId: string,
    ): Promise<ChoreAssignmentRow> => {
      const response = await sendHttpRequest<ChoreAssignmentRow>(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/chores/${choreId}/assign`,
          method: 'POST',
          body: { userId },
        },
        this.config.getAccessToken,
        this.config,
      );

      return response.data;
    },
    history: async (householdId: string, choreId: string): Promise<ChoreRunRow[]> => {
      const response = await sendHttpRequest<
        Array<{ id: string; chore_id: string; completed_by: string; completed_at: string }>
      >(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/chores/${choreId}/history`,
          method: 'GET',
        },
        this.config.getAccessToken,
        this.config,
      );

      return response.data.map((row) => ({
        id: row.id,
        choreId: row.chore_id,
        completedBy: row.completed_by,
        completedAt: row.completed_at,
      }));
    },
  };

  readonly shopping = {
    lists: async (householdId: string): Promise<ShoppingListRow[]> => {
      const response = await sendHttpRequest<ShoppingListRow[]>(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/shopping/lists`,
          method: 'GET',
        },
        this.config.getAccessToken,
        this.config,
      );

      return response.data;
    },
    items: async (householdId: string, listId: string): Promise<ShoppingListItemRow[]> => {
      const response = await sendHttpRequest<ShoppingListItemRow[]>(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/shopping/lists/${listId}/items`,
          method: 'GET',
        },
        this.config.getAccessToken,
        this.config,
      );

      return response.data;
    },
    addItem: async (
      householdId: string,
      listId: string,
      title: string,
      source: 'manual' | 'voice' | 'routine' = 'manual',
    ): Promise<ShoppingItemRow> => {
      const response = await sendHttpRequest<ShoppingItemRow>(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/shopping/items`,
          method: 'POST',
          body: { listId, title, source },
        },
        this.config.getAccessToken,
        this.config,
      );

      return {
        ...response.data,
        purchasedAt:
          (response.data as ShoppingItemRow & { purchased_at?: string | null }).purchased_at ??
          null,
      };
    },
    updateStatus: async (
      householdId: string,
      itemId: string,
      status: ShoppingItemStatus,
    ): Promise<ShoppingItemRow> => this.updateShoppingItemStatus(householdId, itemId, status),
    clearPurchased: async (householdId: string, listId: string): Promise<void> => {
      await sendHttpRequest(
        {
          url: `${this.config.baseUrl}/api/households/${householdId}/shopping/lists/${listId}/items/purchased`,
          method: 'DELETE',
        },
        this.config.getAccessToken,
        this.config,
      );
    },
  };

  async createHousehold(name: string): Promise<HouseholdRow> {
    const response = await sendHttpRequest<HouseholdRow>(
      {
        url: `${this.config.baseUrl}/api/households`,
        method: 'POST',
        body: { name },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async inviteMember(
    householdId: string,
    invitedUserId: string,
    role: HouseholdRole,
  ): Promise<HouseholdMemberRow> {
    const response = await sendHttpRequest<HouseholdMemberRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/members/invite`,
        method: 'POST',
        body: { invitedUserId, role },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async joinHousehold(householdId: string, inviteToken: string): Promise<HouseholdMemberRow> {
    const response = await sendHttpRequest<HouseholdMemberRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/members/join`,
        method: 'POST',
        body: { inviteToken },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async changeMemberRole(
    householdId: string,
    userId: string,
    role: HouseholdRole,
  ): Promise<HouseholdMemberRow> {
    const response = await sendHttpRequest<HouseholdMemberRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/members/${userId}/role`,
        method: 'PATCH',
        body: { role },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async addShoppingItem(
    householdId: string,
    title: string,
    source: 'manual' | 'voice' | 'routine',
  ): Promise<ShoppingItemRow> {
    const response = await sendHttpRequest<ShoppingItemRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/shopping/items`,
        method: 'POST',
        body: { title, source },
      },
      this.config.getAccessToken,
      this.config,
    );

    return {
      ...response.data,
      purchasedAt:
        (response.data as ShoppingItemRow & { purchased_at?: string | null }).purchased_at ?? null,
    };
  }

  async updateShoppingItemStatus(
    householdId: string,
    itemId: string,
    status: ShoppingItemStatus,
  ): Promise<ShoppingItemRow> {
    const response = await sendHttpRequest<ShoppingItemRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/shopping/items/${itemId}/status`,
        method: 'PATCH',
        body: { status },
      },
      this.config.getAccessToken,
      this.config,
    );

    return {
      ...response.data,
      purchasedAt:
        (response.data as ShoppingItemRow & { purchased_at?: string | null }).purchased_at ?? null,
    };
  }

  async createChore(
    householdId: string,
    title: string,
    assignedToUserId: string,
    dueAt: string,
    recurrenceRule?: string,
  ): Promise<ChoreRow> {
    const response = await sendHttpRequest<ChoreRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/chores`,
        method: 'POST',
        body: { title, assignedToUserId, dueAt, recurrenceRule },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async listChores(householdId: string): Promise<ChoreDetailRow[]> {
    return this.chores.list(householdId);
  }

  async assignChore(
    householdId: string,
    choreId: string,
    userId: string,
  ): Promise<ChoreAssignmentRow> {
    return this.chores.assign(householdId, choreId, userId);
  }

  async choreHistory(householdId: string, choreId: string): Promise<ChoreRunRow[]> {
    return this.chores.history(householdId, choreId);
  }

  async completeChore(householdId: string, choreId: string): Promise<ChoreRow> {
    return this.chores.complete(householdId, choreId);
  }

  async createReminder(
    householdId: string,
    objectType: string,
    objectId: string,
    targetUserIds: string[],
    remindAt: string,
  ): Promise<ReminderRow> {
    const response = await sendHttpRequest<ReminderRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/reminders`,
        method: 'POST',
        body: { objectType, objectId, targetUserIds, remindAt },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }

  async createNote(householdId: string, body: string): Promise<NoteRow> {
    const response = await sendHttpRequest<NoteRow>(
      {
        url: `${this.config.baseUrl}/api/households/${householdId}/notes`,
        method: 'POST',
        body: { body },
      },
      this.config.getAccessToken,
      this.config,
    );

    return response.data;
  }
}

/**
 * Main LifeOS SDK client.
 */
export class LifeOSClient {
  readonly auth: AuthClient;
  readonly inbox: InboxNamespace;
  readonly capture: CaptureNamespace;
  readonly timeline: TimelineNamespace;
  readonly notifications: NotificationsNamespace;
  readonly devices: DevicesNamespace;
  readonly review: ReviewNamespace;
  readonly household: HouseholdNamespace;

  constructor(config: SDKConfig) {
    // Apply default timeout if not specified
    const effectiveConfig: SDKConfig = {
      ...config,
      timeout: config.timeout ?? 15000,
    };

    this.auth = new AuthClientImpl(effectiveConfig);
    this.inbox = new InboxNamespace(effectiveConfig);
    this.capture = new CaptureNamespace(effectiveConfig);
    this.timeline = new TimelineNamespace(effectiveConfig);
    this.notifications = new NotificationsNamespace(effectiveConfig);
    this.devices = new DevicesNamespace(effectiveConfig);
    this.review = new ReviewNamespace(effectiveConfig);
    this.household = new HouseholdNamespace(effectiveConfig);
  }
}
