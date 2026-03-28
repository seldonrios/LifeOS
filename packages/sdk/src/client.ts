/**
 * LifeOS SDK client for mobile applications.
 */

import type {
  SDKConfig,
  InboxItem,
  DeviceInfo,
  CaptureRequest,
  CaptureResult,
  TimelineEntry,
  GoalSummary,
  PushTokenRegistration,
} from '@lifeos/contracts';
import { AuthClientImpl, type AuthClient } from './auth';
import { sendHttpRequest } from './http';

/**
 * Inbox namespace — stub implementations.
 */
class InboxNamespace {
  constructor(private config: SDKConfig) {}

  async list(): Promise<InboxItem[]> {
    void this.config;
    const now = Date.now();

    return [
      {
        id: 'inbox_approval_1',
        type: 'approval',
        title: 'Approve updated weekly plan',
        description: 'Scheduler suggests moving deep work blocks to Tuesday and Thursday.',
        createdAt: now - 45 * 60 * 1000,
        read: false,
        data: {
          requestId: 'approval_req_1',
          action: 'schedule.update',
          context: {
            source: 'scheduler',
          },
          deadline: now + 6 * 60 * 60 * 1000,
        },
      },
      {
        id: 'inbox_reminder_1',
        type: 'reminder',
        title: 'Review project milestone notes',
        description: 'Prepare notes before the sync with your accountability group.',
        createdAt: now - 2 * 60 * 60 * 1000,
        read: false,
        data: {
          dueDate: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'inbox_notification_1',
        type: 'notification',
        title: 'Weather module synced',
        description: 'Forecast context has been added to tomorrow morning planning.',
        createdAt: now - 5 * 60 * 60 * 1000,
        read: true,
        data: {
          module: 'weather',
        },
      },
      {
        id: 'inbox_reminder_2',
        type: 'reminder',
        title: '30 minute cardio session',
        description: 'Target heart rate zone 2 for consistency.',
        createdAt: now - 8 * 60 * 60 * 1000,
        read: false,
        data: {
          dueDate: new Date(now + 26 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'inbox_reminder_3',
        type: 'reminder',
        title: 'Process inbox zero block',
        description: 'Triage captured ideas and convert the top 3 into tasks.',
        createdAt: now - 24 * 60 * 60 * 1000,
        read: true,
        data: {
          dueDate: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    ];
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
  }
}
