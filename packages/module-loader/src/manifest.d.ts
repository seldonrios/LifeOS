export interface LifeOSManifestPermissions {
    graph: string[];
    network: string[];
    voice: string[];
    events: string[];
}
export interface LifeOSManifestResources {
    cpu: 'low' | 'medium' | 'high';
    memory: 'low' | 'medium';
}
export interface LifeOSModuleManifest {
    name: string;
    version: string;
    author: string;
    description?: string;
    permissions: LifeOSManifestPermissions;
    resources: LifeOSManifestResources;
    subFeatures?: string[];
    requires: string[];
    category: string;
    tags: string[];
}
export interface LifeOSManifestValidationResult {
    valid: boolean;
    errors: string[];
    manifest?: LifeOSModuleManifest;
}
export interface LifeOSManifestValidationOptions {
    cliVersion?: string;
}
export declare function validateLifeOSManifest(raw: unknown, options?: LifeOSManifestValidationOptions): LifeOSManifestValidationResult;
export declare function readLifeOSManifestFile(path: string): Promise<LifeOSManifestValidationResult>;
