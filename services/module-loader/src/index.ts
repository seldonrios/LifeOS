import { resolve } from 'node:path';

import { createEventBusClient } from '@lifeos/event-bus';
import type { BaseEvent, EventBus } from '@lifeos/event-bus';
import { runModuleLoaderBoot } from '@lifeos/module-loader';
import { ServiceCatalog } from '@lifeos/service-catalog';
import { createEnvSecretStore, startService } from '@lifeos/service-runtime';

function createNoopEventBus(): EventBus {
  return {
    publish: async <T>(_topic: string, _event: BaseEvent<T>): Promise<void> => {
      return;
    },
    subscribe: async <T>(
      _topic: string,
      _handler: (event: BaseEvent<T>) => Promise<void>,
    ): Promise<void> => {
      return;
    },
  };
}

function resolveEventBus(): EventBus {
  try {
    return createEventBusClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown event bus error';
    console.warn(
      JSON.stringify({
        message: 'event bus unavailable, continuing with no-op bus (publish degraded)',
        error: message,
      }),
    );
    return createNoopEventBus();
  }
}

async function bootstrap(): Promise<void> {
  const modulesDir = process.env.LIFEOS_MODULES_DIR ?? resolve(process.cwd(), 'modules');
  const profile = process.env.LIFEOS_PROFILE ?? 'assistant';
  const eventBus = resolveEventBus();

  try {
    const catalog = new ServiceCatalog();
    await runModuleLoaderBoot({
      modulesDir,
      profile,
      catalog,
      eventBus,
    });
    // Start listening on the configured port
    await startService({
      serviceName: 'module-loader-service',
      port: 3009,
      secretRefs: [{ name: 'LIFEOS_MODULES_SIGNING_KEY', policy: 'optional' }],
      secretStore: createEnvSecretStore(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown bootstrap error';
    console.error(
      JSON.stringify({
        message: 'module-loader startup diagnostics failed',
        error: message,
      }),
    );
    process.exit(1);
  }
}

void bootstrap();
