import type { LifeOSManifestPermissions } from './manifest';
export interface PermissionCheckOptions {
    moduleId: string;
    env?: NodeJS.ProcessEnv;
}
export interface PermissionCheckResult {
    allowed: boolean;
    reason?: string;
}
export declare function checkPermissions(permissions: LifeOSManifestPermissions, options: PermissionCheckOptions): Promise<PermissionCheckResult>;
