import type { EventBus } from '@lifeos/event-bus';
import type { DegradedMarker } from '@lifeos/secrets';
import type { ServiceCatalog } from '@lifeos/service-catalog';

import { buildStartupReport, emitStartupReport } from './diagnostics';
import { resolveModulesWithErrors } from './resolver';
import { scanModulesWithErrors } from './scanner';

export { buildStartupReport, emitStartupReport } from './diagnostics';
export { resolveModules, resolveModulesWithErrors } from './resolver';
export { scanModules, scanModulesWithErrors } from './scanner';
export type { ModuleDiagnostic, ModuleManifest, ModuleState, StartupReport } from './types';

export interface ModuleLoaderBootOptions {
  modulesDir: string;
  profile: string;
  catalog: ServiceCatalog;
  eventBus: EventBus;
  degradedSecrets?: DegradedMarker[];
}

export async function runModuleLoaderBoot(options: ModuleLoaderBootOptions) {
  const scanResults = await scanModulesWithErrors(options.modulesDir);
  const diagnostics = resolveModulesWithErrors(scanResults, options.catalog, options.profile);
  const report = buildStartupReport(options.profile, diagnostics, options.degradedSecrets ?? []);
  await emitStartupReport(report, options.eventBus);
  return report;
}
