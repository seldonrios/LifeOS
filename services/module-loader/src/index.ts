import { resolve } from 'node:path';

import { createEventBusClient } from '@lifeos/event-bus';
import { runModuleLoaderBoot } from '@lifeos/module-loader';
import { ServiceCatalog } from '@lifeos/service-catalog';
import { startService } from '@lifeos/service-runtime';

async function bootstrap(): Promise<void> {
  const modulesDir = process.env.LIFEOS_MODULES_DIR ?? resolve(process.cwd(), 'modules');
  const profile = process.env.LIFEOS_PROFILE ?? 'assistant';

  try {
    const eventBus = createEventBusClient();
    const catalog = new ServiceCatalog();
    await runModuleLoaderBoot({ modulesDir, profile, catalog, eventBus });
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

  await startService({ serviceName: 'module-loader-service', port: 3008 });
}

void bootstrap();
