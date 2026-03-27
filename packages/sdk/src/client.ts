/**
 * LifeOS SDK client for mobile applications.
 */

import type {
  SDKConfig,
  InboxItem,
  CaptureRequest,
  CaptureResult,
  TimelineEntry,
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
    void requestId;
    throw new Error('Not implemented — Sprint 3');
  }

  async reject(requestId: string, reason?: string): Promise<void> {
    void requestId;
    void reason;
    throw new Error('Not implemented — Sprint 3');
  }
}

/**
 * Capture namespace — stub implementations.
 */
class CaptureNamespace {
  constructor(private config: SDKConfig) {}

  async create(req: CaptureRequest): Promise<CaptureResult> {
    throw new Error('Not implemented — Sprint 2');
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
      this.config
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
  }
}
