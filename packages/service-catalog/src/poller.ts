import { ServiceCatalog } from './catalog';
import type { CatalogEntry } from './types';

interface StartHealthPollingOptions {
  onStatusChange?: (entry: CatalogEntry, status: CatalogEntry['status']) => Promise<void> | void;
  healthTimeoutMs?: number;
}

const DEFAULT_HEALTH_TIMEOUT_MS = 8_000;

async function checkEntryHealth(
  entry: CatalogEntry,
  healthTimeoutMs: number,
): Promise<CatalogEntry['status']> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, healthTimeoutMs);

  try {
    const response = await fetch(entry.healthUrl, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status === 200) {
      return 'healthy';
    }

    if (response.status === 503) {
      return 'degraded';
    }

    return 'unhealthy';
  } catch {
    return 'unhealthy';
  } finally {
    clearTimeout(timeout);
  }
}

export function startHealthPolling(
  catalog: ServiceCatalog,
  intervalMs = 15_000,
  options: StartHealthPollingOptions = {},
): () => void {
  const healthTimeoutMs =
    typeof options.healthTimeoutMs === 'number' && Number.isFinite(options.healthTimeoutMs)
      ? Math.max(10, Math.floor(options.healthTimeoutMs))
      : DEFAULT_HEALTH_TIMEOUT_MS;

  const run = async (): Promise<void> => {
    const entries = catalog.getAll();
    await Promise.all(
      entries.map(async (entry) => {
        const status = await checkEntryHealth(entry, healthTimeoutMs);
        catalog.updateStatus(entry.id, status);
        if (options.onStatusChange && status !== entry.status) {
          await options.onStatusChange(entry, status);
        }
      }),
    );
  };

  let isRunning = false;
  const runSafe = (): void => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    void run().finally(() => {
      isRunning = false;
    });
  };

  runSafe();
  const timer = setInterval(() => {
    runSafe();
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
