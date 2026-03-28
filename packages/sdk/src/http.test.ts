import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendHttpRequest, type RetryPolicy } from './http';
import type { SDKConfig } from '@lifeos/contracts';

describe('sendHttpRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let onAuthExpiredMock: ReturnType<typeof vi.fn>;
  let config: Pick<SDKConfig, 'timeout' | 'onAuthExpired'>;

  beforeEach(() => {
    fetchMock = vi.fn();
    onAuthExpiredMock = vi.fn();
    config = {
      timeout: 1000,
      onAuthExpired: onAuthExpiredMock as () => void,
    };
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('handles happy path: 200 response with JSON body', async () => {
    const responseData = { user: { id: 'user_001', email: 'test@example.com' } };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'POST',
        body: { test: 'data' },
      },
      () => 'test-token',
      config,
    );

    expect(result.status).toBe(200);
    expect(result.data).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify Authorization header was set - safe access
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1]) {
      expect(callArgs[1].headers.get('Authorization')).toBe('Bearer test-token');
    }
  });

  it('retries on 5xx and succeeds after retries', async () => {
    const responseData = { success: true };
    const retryPolicy: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: 10,
    };

    // First two calls return 503, third returns 200
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));

    const result = await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'GET',
      },
      () => null,
      config,
      retryPolicy,
    );

    expect(result.status).toBe(200);
    expect(result.data).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx errors', async () => {
    const retryPolicy: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: 10,
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }),
    );

    const error = await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'POST',
        body: { test: 'data' },
      },
      () => null,
      config,
      retryPolicy,
    ).catch((e) => e);

    // Should only be called once despite retryPolicy
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Verify it's a LifeOSError with retryable: false
    expect(error).toBeDefined();
    expect(error).toHaveProperty('code');
    expect(error).toHaveProperty('retryable', false);
  });

  it('calls onAuthExpired on 401 and throws AUTH_EXPIRED error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    const error = await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'GET',
      },
      () => 'expired-token',
      config,
    ).catch((e) => e);

    expect(onAuthExpiredMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Verify AUTH_EXPIRED error code
    expect(error).toBeDefined();
    expect(error.code).toBe('AUTH_EXPIRED');
    expect(error).toHaveProperty('retryable', false);
  });

  it('does not retry on 401 even with retry policy', async () => {
    const retryPolicy: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: 10,
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    const error = await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'GET',
      },
      () => 'expired-token',
      config,
      retryPolicy,
    ).catch((e) => e);

    // Should only be called once despite retryPolicy
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onAuthExpiredMock).toHaveBeenCalledTimes(1);
    // Verify AUTH_EXPIRED error
    expect(error.code).toBe('AUTH_EXPIRED');
  });

  it('handles timeout with AbortController', async () => {
    let abortWasCalled = false;

    fetchMock.mockImplementation((_url: string, options?: RequestInit) => {
      const signal = options?.signal;

      // Simulate checking for abort during fetch
      if (signal?.aborted) {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }

      // Listen for abort happening after fetch is called
      if (signal) {
        signal.addEventListener('abort', () => {
          abortWasCalled = true;
        });
      }

      // Return a very slow response (simulating timeout)
      return new Promise((_resolve, reject) => {
        const timeout = setTimeout(() => {
          const error = new Error('Network timeout');
          reject(error);
        }, 10000);

        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }
      });
    });

    const error = await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'GET',
      },
      () => null,
      { timeout: 50, onAuthExpired: () => {} },
    ).catch((e) => e);

    // Should throw AbortError due to timeout
    expect(error).toBeDefined();
    expect(error.name).toBe('AbortError');
    expect(abortWasCalled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('injects Authorization header when token is available', async () => {
    const responseData = { data: 'test' };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));

    await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'POST',
        body: { test: 'data' },
      },
      () => 'my-token',
      config,
    );

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1]) {
      expect(callArgs[1].headers.get('Authorization')).toBe('Bearer my-token');
    }
  });

  it('does not inject Authorization header when token is null', async () => {
    const responseData = { data: 'test' };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));

    await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'POST',
        body: { test: 'data' },
      },
      () => null,
      config,
    );

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1]) {
      expect(callArgs[1].headers.get('Authorization')).toBeNull();
    }
  });

  it('sets Content-Type header for POST with body', async () => {
    const responseData = { data: 'test' };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));

    await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'POST',
        body: { test: 'data' },
      },
      () => null,
      config,
    );

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1]) {
      expect(callArgs[1].headers.get('Content-Type')).toBe('application/json');
    }
  });

  it('preserves custom headers from request', async () => {
    const responseData = { data: 'test' };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));

    await sendHttpRequest(
      {
        url: 'http://localhost:3000/api/test',
        method: 'POST',
        body: { test: 'data' },
        headers: { 'X-Custom': 'value' },
      },
      () => null,
      config,
    );

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1]) {
      expect(callArgs[1].headers.get('X-Custom')).toBe('value');
    }
  });
});
