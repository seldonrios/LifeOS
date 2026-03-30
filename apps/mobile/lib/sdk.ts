import Constants from 'expo-constants';
import { LifeOSClient } from '@lifeos/sdk';
import { sidecarGetDailyReview, sidecarCompleteAction, type ReviewLoopSummary } from './sidecar-bridge';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

function loadSessionStore() {
  return require('./session') as typeof import('./session');
}

function loadQueueStore() {
  return require('./queue') as typeof import('./queue');
}

export const sdk = new LifeOSClient({
  baseUrl: extra?.apiUrl ?? 'http://localhost:3005',
  getAccessToken: () => loadSessionStore().useSessionStore.getState().accessToken,
  onAuthExpired: () => {
    void loadSessionStore().useSessionStore.getState().signOut();
  },
});

/**
 * Complete an action using sidecar IPC if available, otherwise fall back to HTTP.
 * On network/transient failures, enqueues for retry and resolves (not throws).
 * Only throws on unrecoverable errors (validation, auth, etc).
 */
export async function completeAction(actionId: string): Promise<void> {
  // Helper to check if an error is likely recoverable (network/transient)
  const isRecoverableError = (err: unknown): boolean => {
    if (err instanceof TypeError && err.message.includes('network')) return true;
    if (err instanceof Error && (err.message.includes('Network') || err.message.includes('timeout'))) return true;
    // ECONNREFUSED, ENOTFOUND, etc. from network operations
    if (err instanceof Error && /^E[A-Z]+/.test(err.message)) return true;
    return false;
  };

  try {
    const sidecarResult = await sidecarCompleteAction(actionId);
    if (sidecarResult !== null) {
      return;
    }
  } catch (sidecarError) {
    // Sidecar is available but the command failed.
    if (isRecoverableError(sidecarError)) {
      // Recoverable error - enqueue and resolve silently
      const { useQueueStore } = loadQueueStore();
      useQueueStore.getState().enqueue({
        type: 'complete_action',
        payload: { actionId },
        conflictPolicy: 'last-write-wins',
      });
      return; // Resolve successfully (queued)
    }
    // Unrecoverable error - propagate
    throw sidecarError;
  }

  // Tauri not available; try HTTP
  try {
    await sdk.inbox.completeAction(actionId);
  } catch (httpError) {
    // HTTP failed.
    if (isRecoverableError(httpError)) {
      // Recoverable error - enqueue and resolve silently
      const { useQueueStore } = loadQueueStore();
      useQueueStore.getState().enqueue({
        type: 'complete_action',
        payload: { actionId },
        conflictPolicy: 'last-write-wins',
      });
      return; // Resolve successfully (queued)
    }
    // Unrecoverable error - propagate
    throw httpError;
  }
}

/**
 * Get daily review using sidecar IPC if available, otherwise fall back to HTTP.
 */
export async function getDailyReview(): Promise<ReviewLoopSummary> {
  try {
    const sidecarResult = await sidecarGetDailyReview();
    if (sidecarResult !== null) {
      return sidecarResult;
    }
  } catch (sidecarError) {
    // Tauri is available but the command failed; propagate and let caller handle
    throw sidecarError;
  }

  // Tauri not available; fall back to HTTP
  return sdk.review.getDailyReview();
}
