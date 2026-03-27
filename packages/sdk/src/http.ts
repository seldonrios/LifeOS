/**
 * HTTP transport layer for the LifeOS SDK.
 */

import type { SDKConfig, LifeOSError } from '@lifeos/contracts';
import { mapHttpStatusToError } from './errors';

/**
 * Retry policy configuration for HTTP requests.
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

/**
 * Base request wrapper.
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
 * Returns a bearer token string (without "Bearer " prefix) or null if no token available.
 */
export type AuthHeaderInjector = () => string | null;

/**
 * LifeOSError with stack support for ErrorLike interface.
 */
interface ErrorLike extends LifeOSError {
  stack?: string;
}

/**
 * Send HTTP request with optional retry policy, timeout, and auth injection.
 */
export async function sendHttpRequest<T = unknown>(
  request: HttpRequest,
  authInjector: AuthHeaderInjector,
  config: Pick<SDKConfig, 'timeout' | 'onAuthExpired'>,
  retryPolicy?: RetryPolicy
): Promise<HttpResponse<T>> {
  const maxAttempts = retryPolicy?.maxAttempts ?? 1;
  const backoffMs = retryPolicy?.backoffMs ?? 100;

  let lastError: ErrorLike | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        config.timeout ?? 15000
      );

      try {
        const headers = new Headers(request.headers ?? {});

        // Inject auth header if available
        const token = authInjector();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        // Set Content-Type for POST/PUT/PATCH with body
        if (
          (request.method === 'POST' ||
            request.method === 'PUT' ||
            request.method === 'PATCH') &&
          request.body !== undefined
        ) {
          headers.set('Content-Type', 'application/json');
        }

        // Build RequestInit without body when undefined to avoid type issues
        const fetchOptions: RequestInit = {
          method: request.method,
          headers,
          signal: controller.signal,
        };

        if (request.body !== undefined) {
          fetchOptions.body = JSON.stringify(request.body);
        }

        const response = await fetch(request.url, fetchOptions);
        clearTimeout(timeoutHandle);

        // Handle 401 auth expiration (never retry, always fail)
        if (response.status === 401) {
          config.onAuthExpired();
          const error: ErrorLike = {
            code: 'AUTH_EXPIRED',
            message: 'Unauthorized',
            retryable: false,
          };
          throw error;
        }

        // Handle 4xx errors (no retry) - throw immediately to exit retry loop
        if (response.status >= 400 && response.status < 500) {
          throw mapHttpStatusToError(response.status);
        }

        // Handle 5xx errors with retry
        if (response.status >= 500) {
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          throw mapHttpStatusToError(response.status);
        }

        // Success: parse and return
        const data = await response.json();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          status: response.status,
          headers: responseHeaders,
          data: data as T,
        };
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch (error) {
      // Timeout errors should propagate immediately
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      // Check if error is already a structured LifeOSError
      if (error && typeof error === 'object' && 'code' in error && 'retryable' in error) {
        const lifeosError = error as ErrorLike;
        // 4xx errors (including 401) should not retry
        if (!lifeosError.retryable) {
          throw lifeosError;
        }
        lastError = lifeosError;
      } else {
        // Convert unknown errors to LifeOSError
        lastError =
          error instanceof Error
            ? {
                code: 'NETWORK_ERROR',
                message: error.message,
                retryable: true,
              }
            : {
                code: 'UNKNOWN_ERROR',
                message: String(error),
                retryable: true,
              };
      }

      // Don't retry on final attempt
      if (attempt === maxAttempts - 1) {
        throw lastError;
      }

      // Wait before retrying (only for retryable errors)
      if (lastError.retryable) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } else {
        throw lastError;
      }
    }
  }

  throw lastError || { code: 'UNKNOWN_ERROR', message: 'HTTP request failed', retryable: false };
}
