export type RuntimeProfile = 'minimal' | 'assistant' | 'ambient' | 'multimodal' | 'production';
export interface CapabilitySpec {
  capability: string;
  version: string;
  description?: string;
}
export interface ProviderManifest {
  provider_id: string;
  capability: CapabilitySpec;
  priority?: number;
  supports_profiles?: RuntimeProfile[];
}
export interface DependencySpec {
  capability: string;
  version_range: string;
}
export interface HardwareRequirementSpec {
  id: string;
  description: string;
  required: boolean;
}
export interface DegradedModeSpec {
  name: string;
  description: string;
  disabled_features: string[];
}
export interface SchemaExtensionSpec {
  schema_id: string;
  version: string;
}
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  provides: CapabilitySpec[];
  requires: DependencySpec[];
  optional: DependencySpec[];
  hardware?: HardwareRequirementSpec[];
  runtime_profiles?: RuntimeProfile[];
  schema_extensions?: SchemaExtensionSpec[];
  feature_flags?: string[];
  permissions: string[];
  degraded_modes?: DegradedModeSpec[];
  entrypoint: {
    type: 'module';
    path: string;
  };
  max_core_version?: string;
}
export declare enum ProviderType {
  module = 'module',
  provider = 'provider',
  core = 'core',
}
export declare enum CapabilityStatus {
  available = 'available',
  degraded = 'degraded',
  unavailable = 'unavailable',
}
export interface CapabilityRegistryEntry {
  capability_id: string;
  version: string;
  provided_by: string;
  provider_type: ProviderType;
  status: CapabilityStatus;
}
export interface CapabilityRegistryClient {
  register(entry: CapabilityRegistryEntry): void;
  lookup(capabilityId: string): CapabilityRegistryEntry | undefined;
  listAll(): CapabilityRegistryEntry[];
}
//# sourceMappingURL=types.d.ts.map
