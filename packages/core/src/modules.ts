import { listFirstPartyModulesByTier } from './module-catalog';

/**
 * Module tiers for the current MVP:
 * - `baselineModules` are always loaded and user-facing.
 * - `optionalModules` are user-enabled and stored in module state using canonical ids.
 * - `systemModules` are platform-managed modules. Some remain hidden from CLI lists.
 */
export const baselineModules = listFirstPartyModulesByTier('baseline') as readonly [
  'scheduler',
  'notes',
  'calendar',
  'personality',
  'briefing',
];

export const optionalModules = listFirstPartyModulesByTier('optional') as readonly [
  'research',
  'weather',
  'news',
  'email-summarizer',
  'habit-streak',
  'health-tracker',
  'google-bridge',
];

export const systemModules = listFirstPartyModulesByTier('system') as readonly [
  'reminder',
  'sync-core',
  'household-capture-router',
  'household-chores',
  'household-shopping',
  'home-state',
  'voice',
];

export type BaselineModuleId = (typeof baselineModules)[number];
export type OptionalModuleId = (typeof optionalModules)[number];
export type SystemModuleId = (typeof systemModules)[number];
export type KnownModuleId = BaselineModuleId | OptionalModuleId | SystemModuleId;

const BASELINE_SET = new Set<string>(baselineModules);
const OPTIONAL_SET = new Set<string>(optionalModules);
const SYSTEM_SET = new Set<string>(systemModules);

export function isBaselineModule(value: string): value is BaselineModuleId {
  return BASELINE_SET.has(value);
}

export function isOptionalModule(value: string): value is OptionalModuleId {
  return OPTIONAL_SET.has(value);
}

export function isSystemModule(value: string): value is SystemModuleId {
  return SYSTEM_SET.has(value);
}
