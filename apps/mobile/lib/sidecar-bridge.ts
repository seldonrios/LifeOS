/**
 * Bridge module for routing mobile SDK calls through desktop sidecar when running in Tauri.
 * Falls back to HTTP endpoints when not in Tauri environment.
 *
 * Uses dynamic/runtime access to Tauri APIs to avoid TypeScript build errors in React Native context.
 */

import type { ReviewLoopSummary } from '@lifeos/contracts';

type TauriInvoke = (cmd: string, payload?: unknown) => Promise<unknown>;
type TauriGlobals = typeof globalThis & {
  __TAURI_INTERNALS__?: {
    invoke?: TauriInvoke;
  };
};

function isTauriRuntime(): boolean {
  // Runtime check using globalThis to avoid React Native type conflicts
  const runtimeGlobals = globalThis as TauriGlobals;
  return runtimeGlobals.__TAURI_INTERNALS__ !== undefined;
}

/**
 * Dynamically access Tauri invoke API without static import to support RN typings.
 */
async function getTauriInvoke(): Promise<{ invoke: TauriInvoke } | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    // Use dynamic require/import if available, with fallback to globalThis
    const runtimeGlobals = globalThis as TauriGlobals;
    if (runtimeGlobals.__TAURI_INTERNALS__?.invoke) {
      return { invoke: runtimeGlobals.__TAURI_INTERNALS__.invoke };
    }

    // Fallback for environments with proper module loading
    if (typeof require !== 'undefined') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const tauri = require('@tauri-apps/api/core');
        return { invoke: tauri.invoke };
      } catch {
        return null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Complete an action through sidecar IPC when in Tauri.
 * Propagates errors so failures are visible and can trigger queue fallback.
 * Returns null only when Tauri is not available (not on error).
 */
export async function sidecarCompleteAction(actionId: string): Promise<void | null> {
  const tauri = await getTauriInvoke();
  if (tauri === null) {
    return null;
  }

  // Call the actual registered Tauri command with correct payload contract
  // Do not catch errors; let them propagate so caller can queue on failure
  await tauri.invoke('task_complete', { task_id: actionId });
  return;
}

/**
 * Get daily review through sidecar IPC when in Tauri.
 * Propagates errors so failures are visible and can trigger queue fallback.
 * Returns null only when Tauri is not available (not on error).
 */
export async function sidecarGetDailyReview(): Promise<ReviewLoopSummary | null> {
  const tauri = await getTauriInvoke();
  if (tauri === null) {
    return null;
  }

  // Call the daily review command (will be registered in lib.rs)
  // Do not catch errors; let them propagate so caller can queue on failure
  return (await tauri.invoke('review_daily')) as ReviewLoopSummary;
}
