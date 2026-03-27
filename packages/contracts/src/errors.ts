/**
 * Error types for the LifeOS mobile SDK.
 */

export interface LifeOSError {
  code: string;
  message: string;
  retryable: boolean;
}
