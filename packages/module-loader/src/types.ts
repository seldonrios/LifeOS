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

export interface LifeOSManifestPermissions {
  graph: string[];
  network: string[];
  voice: string[];
  events: string[];
}

export interface LifeOSModuleManifest {
  name: string;
  version: string;
  author: string;
  description?: string;
  permissions: LifeOSManifestPermissions;
  requires: string[];
  category: string;
  tags: string[];
}

export interface LifeOSManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: LifeOSModuleManifest;
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
