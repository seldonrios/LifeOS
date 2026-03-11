import type { ModuleManifest } from '@lifeos/capability-registry';

export type ModuleRuntimeState = 'enabled' | 'degraded' | 'disabled' | 'error';

export interface ModuleResolutionResult {
  module_id: string;
  state: ModuleRuntimeState;
  resolved_requires: string[];
  missing_requires: string[];
  missing_optional: string[];
  hardware_warnings: string[];
  profile_support: string[];
  notes: string[];
}

export interface DependencyEngineClient {
  resolve(manifests: ModuleManifest[]): ModuleResolutionResult[];
}
