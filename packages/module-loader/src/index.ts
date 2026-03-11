import type { EventBus } from '@lifeos/event-bus';
import type { ServiceCatalog } from '@lifeos/service-catalog';

import { buildStartupReport, emitStartupReport } from './diagnostics';
import { resolveModules } from './resolver';
import { scanModules } from './scanner';

export { buildStartupReport, emitStartupReport } from './diagnostics';
export { resolveModules } from './resolver';
export { scanModules } from './scanner';
export type { ModuleDiagnostic, ModuleManifest, ModuleState, StartupReport } from './types';

export interface ModuleLoaderBootOptions {
  modulesDir: string;
  profile: string;
  catalog: ServiceCatalog;
  eventBus: EventBus;
}

export async function runModuleLoaderBoot(options: ModuleLoaderBootOptions) {
  const manifests = await scanModules(options.modulesDir);
  const diagnostics = resolveModules(manifests, options.catalog, options.profile);
  const report = buildStartupReport(options.profile, diagnostics);
  await emitStartupReport(report, options.eventBus);
  return report;
}
