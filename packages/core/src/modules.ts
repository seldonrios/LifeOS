/**
 * Module tiers for the current MVP:
 * - `baselineModules` are always loaded, user-facing, and toggleable in a future phase.
 * - `optionalModules` are user-enabled; implementations may be `null` when not yet available.
 * - `systemModules` are always-on infrastructure modules and are not user-toggleable.
 */
export const baselineModules = [
  'scheduler',
  'notes',
  'calendar',
  'personality',
  'briefing',
] as const;

export const optionalModules = [
  'research',
  'weather',
  'news',
  'email-summarizer',
  'habit-streak',
  'health',
  'google-bridge',
] as const;

export const systemModules = [
  'reminder',
  'sync-core',
  'household-capture-router',
  'household-chores',
  'household-shopping',
] as const;

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
