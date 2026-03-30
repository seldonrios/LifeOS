/**
 * Bridge module for routing mobile SDK calls through desktop sidecar when running in Tauri.
 * Falls back to HTTP endpoints when not in Tauri environment.
 *
 * Uses dynamic/runtime access to Tauri APIs to avoid TypeScript build errors in React Native context.
 */

export interface ReviewLoopSummary {
  pendingCaptures: number;
  actionsDueToday: number;
  unacknowledgedReminders: number;
  completedActions: string[];
  suggestedNextActions?: string[];
}

function isTauriRuntime(): boolean {
  // Runtime check using globalThis to avoid React Native type conflicts
  const globalAny = globalThis as any;
  return globalAny.__TAURI_INTERNALS__ !== undefined;
}

/**
 * Dynamically access Tauri invoke API without static import to support RN typings.
 */
async function getTauriInvoke(): Promise<{ invoke: (cmd: string, payload?: any) => Promise<any> } | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    // Use dynamic require/import if available, with fallback to globalThis
    const globalAny = globalThis as any;
    if (globalAny.__TAURI_INTERNALS__?.invoke) {
      return { invoke: globalAny.__TAURI_INTERNALS__.invoke };
    }

    // Fallback for environments with proper module loading
    if (typeof require !== 'undefined') {
      try {
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
  return await tauri.invoke('review_daily');
}
