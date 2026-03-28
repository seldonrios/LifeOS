/**
 * Error handling utilities for the LifeOS SDK.
 */

import type { LifeOSError } from '@lifeos/contracts';

export { type LifeOSError } from '@lifeos/contracts';

/**
 * Maps an HTTP status code to a LifeOSError.
 * Sprint 2 will implement real HTTP error mapping.
 */
export function mapHttpStatusToError(status: number, message?: string): LifeOSError {
  // Stub implementation - Sprint 2 will wire real HTTP logic
  const defaultMessage = message || `HTTP ${status}`;

  return {
    code: `HTTP_${status}`,
    message: defaultMessage,
    retryable: status >= 500 || status === 408 || status === 429,
  };
}
