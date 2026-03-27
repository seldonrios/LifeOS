/**
 * LifeOS SDK client for mobile applications.
 * Sprint 1 provides type definitions and stub implementations.
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

/**
 * Inbox namespace — stub implementations.
 */
class InboxNamespace {
  constructor(private config: SDKConfig) {}

  async list(): Promise<InboxItem[]> {
    throw new Error('Not implemented — Sprint 2');
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
    throw new Error('Not implemented — Sprint 2');
  }
}

/**
 * Notifications namespace — stub implementations.
 */
class NotificationsNamespace {
  constructor(private config: SDKConfig) {}

  async registerPushToken(req: PushTokenRegistration): Promise<void> {
    throw new Error('Not implemented — Sprint 2');
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
