import type {
  CapabilitySpec,
  DependencySpec,
  HardwareRequirementSpec,
} from '@lifeos/capability-registry';
import type { DegradedMarker } from '@lifeos/secrets';

/**
 * @future
 * This interface is a future capability-registry-oriented manifest shape, reserved for a later
 * platform version. It is NOT the current runtime manifest shape and is NOT intended for module
 * authors in the current MVP. Module authors should use `LifeOSModuleManifest` from
 * `@lifeos/module-loader` instead.
 */
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  provides: Array<string | CapabilitySpec>;
  requires: Array<string | DependencySpec>;
  optional: Array<string | DependencySpec>;
  hardware?: Array<string | HardwareRequirementSpec>;
  degradedModes?: Record<string, string>;
}

export type ModuleState = 'enabled' | 'degraded' | 'disabled' | 'error';

export type ScanResult =
  | {
      kind: 'ok';
      manifest: ModuleManifest;
    }
  | {
      kind: 'error';
      moduleName: string;
      message: string;
    };

export interface ModuleDiagnostic {
  id: string;
  state: ModuleState;
  missingProviders: string[];
  missingOptional: string[];
  hardwareWarnings: string[];
  reason?: string;
}

export interface StartupReport {
  profile: string;
  modules: ModuleDiagnostic[];
  degradedSecrets?: DegradedMarker[];
  recommendations: string[];
  emittedAt: string;
}
