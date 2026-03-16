import type {
  CapabilitySpec,
  DependencySpec,
  HardwareRequirementSpec,
} from '@lifeos/capability-registry';
import type { DegradedMarker } from '@lifeos/secrets';

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

export type ModuleState = 'enabled' | 'degraded' | 'disabled';

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
