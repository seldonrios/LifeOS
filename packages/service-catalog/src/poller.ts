import { ServiceCatalog } from './catalog';
import type { CatalogEntry } from './types';

interface StartHealthPollingOptions {
  onStatusChange?: (entry: CatalogEntry, status: CatalogEntry['status']) => Promise<void> | void;
}

async function checkEntryHealth(entry: CatalogEntry): Promise<CatalogEntry['status']> {
  try {
    const response = await fetch(entry.healthUrl);

    if (response.status === 200) {
      return 'healthy';
    }

    if (response.status === 503) {
      return 'degraded';
    }

    return 'unhealthy';
  } catch {
    return 'unhealthy';
  }
}

export function startHealthPolling(
  catalog: ServiceCatalog,
  intervalMs = 15_000,
  options: StartHealthPollingOptions = {},
): () => void {
  const run = async (): Promise<void> => {
    const entries = catalog.getAll();
    await Promise.all(
      entries.map(async (entry) => {
        const status = await checkEntryHealth(entry);
        catalog.updateStatus(entry.id, status);
        if (options.onStatusChange && status !== entry.status) {
          await options.onStatusChange(entry, status);
        }
      }),
    );
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
