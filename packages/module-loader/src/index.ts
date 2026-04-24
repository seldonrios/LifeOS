export { ModuleLoader, createModuleLoader, moduleLoader } from './loader';
export type {
	CreateModuleLoaderOptions,
	LifeOSModule,
	ModuleRuntimeContext,
	RestrictedEventBus,
} from './loader';
export {
	readLifeOSManifestFile,
	validateLifeOSManifest,
	type LifeOSManifestValidationOptions,
	type LifeOSManifestValidationResult,
	type LifeOSManifestPermissions,
	type LifeOSModuleManifest,
} from './manifest';

export const LIFEOS_MANIFEST_SCHEMA_PATH = new URL('./manifest-schema.json', import.meta.url);
