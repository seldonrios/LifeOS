import type { ServiceCatalog } from '@lifeos/service-catalog';

import type { ModuleDiagnostic, ModuleManifest } from './types';

function getCapabilityId(value: string | { capability: string }): string {
  return typeof value === 'string' ? value : value.capability;
}

function getHardwareId(value: string | { id: string }): string {
  return typeof value === 'string' ? value : value.id;
}

function getAvailableHardware(): string[] {
  const raw = process.env.LIFEOS_HARDWARE ?? '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function resolveModules(
  manifests: ModuleManifest[],
  catalog: ServiceCatalog,
  profile: string,
): ModuleDiagnostic[] {
  void profile;
  const availableHardware = getAvailableHardware();

  return manifests.map((manifest) => {
    const missingProviders = manifest.requires
      .map((requirement) => getCapabilityId(requirement))
      .filter((capability) => !catalog.resolve(capability));
    const missingOptional = manifest.optional
      .map((optional) => getCapabilityId(optional))
      .filter((capability) => !catalog.resolve(capability));
    const requiredHardware = (manifest.hardware ?? []).map((hardware) => getHardwareId(hardware));
    const hardwareWarnings = requiredHardware.filter(
      (capability) => !availableHardware.includes(capability),
    );

    let state: ModuleDiagnostic['state'] = 'enabled';
    if (missingProviders.length > 0) {
      state = 'disabled';
    } else if (missingOptional.length > 0 || hardwareWarnings.length > 0) {
      state = 'degraded';
    }

    const reason =
      state === 'disabled'
        ? `Missing required providers: ${missingProviders.join(', ')}`
        : state === 'degraded'
          ? `Running degraded due to optional dependencies or hardware constraints.`
          : undefined;

    const diagnostic: ModuleDiagnostic = {
      id: manifest.id,
      state,
      missingProviders,
      missingOptional,
      hardwareWarnings,
    };

    if (reason) {
      diagnostic.reason = reason;
    }

    return diagnostic;
  });
}
