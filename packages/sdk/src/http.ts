/**
 * HTTP transport layer for the LifeOS SDK.
 * Sprint 2 will implement real fetch-based transport.
 */

/**
 * Retry policy configuration for HTTP requests.
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

/**
 * Base request wrapper.
 * Sprint 2 will implement real HTTP execution.
 */
export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * HTTP response wrapper.
 */
export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

/**
 * Internal function to inject auth header into request.
 * Sprint 2 will use this to automatically attach bearer tokens.
 */
export type AuthHeaderInjector = () => string | null;

/**
 * Stub: send HTTP request with optional retry policy.
 * Sprint 2 will implement real fetch logic and retries.
 */
export async function sendHttpRequest<T = unknown>(
  request: HttpRequest,
  authInjector: AuthHeaderInjector,
  retryPolicy?: RetryPolicy
): Promise<HttpResponse<T>> {
  throw new Error('Not implemented — Sprint 2 will wire real fetch transport');
}
