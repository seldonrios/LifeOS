/**
 * @lifeos/sdk — Mobile SDK for LifeOS
 */

export { LifeOSClient } from './client';
export { AuthClientImpl, type AuthClient } from './auth';
export type { SDKConfig, GoalSummary, DeviceInfo } from '@lifeos/contracts';
export { mapHttpStatusToError, type LifeOSError } from './errors';
export {
  type HttpRequest,
  type HttpResponse,
  type RetryPolicy,
  type AuthHeaderInjector,
  sendHttpRequest,
} from './http';

import type { SDKConfig } from '@lifeos/contracts';
import { LifeOSClient } from './client';

/**
 * Factory function to create a LifeOS SDK client.
 */
export function createClient(config: SDKConfig): LifeOSClient {
  return new LifeOSClient(config);
}
