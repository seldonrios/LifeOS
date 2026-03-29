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
  }
}
