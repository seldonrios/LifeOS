export const baselineModules = [
  'scheduler',
  'notes',
  'calendar',
  'personality',
  'briefing',
] as const;

export const optionalModules = ['research', 'weather', 'news', 'health'] as const;

export type BaselineModuleId = (typeof baselineModules)[number];
export type OptionalModuleId = (typeof optionalModules)[number];
export type KnownModuleId = BaselineModuleId | OptionalModuleId;

const BASELINE_SET = new Set<string>(baselineModules);
const OPTIONAL_SET = new Set<string>(optionalModules);

export function isBaselineModule(value: string): value is BaselineModuleId {
  return BASELINE_SET.has(value);
}

export function isOptionalModule(value: string): value is OptionalModuleId {
  return OPTIONAL_SET.has(value);
}
