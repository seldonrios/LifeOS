export type ModuleTier = 'baseline' | 'optional' | 'system';

export type FirstPartyImplementationBinding =
  | 'calendarModule'
  | 'emailSummarizerModule'
  | 'googleBridgeModule'
  | 'habitStreakModule'
  | 'healthTrackerModule'
  | 'homeStateModule'
  | 'householdCaptureRouterModule'
  | 'householdChoresModule'
  | 'householdShoppingModule'
  | 'newsModule'
  | 'notesModule'
  | 'orchestratorModule'
  | 'reminderModule'
  | 'researchModule'
  | 'schedulerModule'
  | 'syncModule'
  | 'voiceModule'
  | 'weatherModule';

export interface FirstPartyModuleCatalogEntry {
  canonicalId: string;
  manifestDirectory: string;
  tier: ModuleTier;
  implementationBinding: FirstPartyImplementationBinding;
  implementationAvailable: boolean;
  aliases: string[];
  userToggleable: boolean;
  visibleInCli: boolean;
  bootMode: 'always' | 'optional' | 'manual';
  statusText?: string;
  sharedImplementationWith?: string[];
}

export const firstPartyModuleCatalog = [
  {
    canonicalId: 'scheduler',
    manifestDirectory: 'scheduler',
    tier: 'baseline',
    implementationBinding: 'schedulerModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
  },
  {
    canonicalId: 'notes',
    manifestDirectory: 'notes',
    tier: 'baseline',
    implementationBinding: 'notesModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
  },
  {
    canonicalId: 'calendar',
    manifestDirectory: 'calendar',
    tier: 'baseline',
    implementationBinding: 'calendarModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
  },
  {
    canonicalId: 'personality',
    manifestDirectory: 'orchestrator',
    tier: 'baseline',
    implementationBinding: 'orchestratorModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    sharedImplementationWith: ['briefing'],
    statusText: 'Uses the orchestrator implementation in the current MVP.',
  },
  {
    canonicalId: 'briefing',
    manifestDirectory: 'orchestrator',
    tier: 'baseline',
    implementationBinding: 'orchestratorModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    sharedImplementationWith: ['personality'],
    statusText: 'Uses the orchestrator implementation in the current MVP.',
  },
  {
    canonicalId: 'research',
    manifestDirectory: 'research',
    tier: 'optional',
    implementationBinding: 'researchModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
  },
  {
    canonicalId: 'weather',
    manifestDirectory: 'weather',
    tier: 'optional',
    implementationBinding: 'weatherModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
  },
  {
    canonicalId: 'news',
    manifestDirectory: 'news',
    tier: 'optional',
    implementationBinding: 'newsModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
  },
  {
    canonicalId: 'email-summarizer',
    manifestDirectory: 'email-summarizer',
    tier: 'optional',
    implementationBinding: 'emailSummarizerModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
  },
  {
    canonicalId: 'habit-streak',
    manifestDirectory: 'habit-streak',
    tier: 'optional',
    implementationBinding: 'habitStreakModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
  },
  {
    canonicalId: 'health-tracker',
    manifestDirectory: 'health-tracker',
    tier: 'optional',
    implementationBinding: 'healthTrackerModule',
    implementationAvailable: true,
    aliases: ['health'],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
    statusText: 'Alias "health" remains accepted for current MVP compatibility.',
  },
  {
    canonicalId: 'google-bridge',
    manifestDirectory: 'google-bridge',
    tier: 'optional',
    implementationBinding: 'googleBridgeModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: true,
    visibleInCli: true,
    bootMode: 'optional',
  },
  {
    canonicalId: 'reminder',
    manifestDirectory: 'reminder',
    tier: 'system',
    implementationBinding: 'reminderModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    statusText: 'Always-on runtime infrastructure for reminders.',
  },
  {
    canonicalId: 'sync-core',
    manifestDirectory: 'sync-core',
    tier: 'system',
    implementationBinding: 'syncModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    statusText: 'Always-on runtime infrastructure for paired-device sync.',
  },
  {
    canonicalId: 'household-capture-router',
    manifestDirectory: 'household-capture-router',
    tier: 'system',
    implementationBinding: 'householdCaptureRouterModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    statusText: 'Always-on household intake routing infrastructure.',
  },
  {
    canonicalId: 'household-chores',
    manifestDirectory: 'household-chores',
    tier: 'system',
    implementationBinding: 'householdChoresModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    statusText: 'Always-on household chores infrastructure.',
  },
  {
    canonicalId: 'household-shopping',
    manifestDirectory: 'household-shopping',
    tier: 'system',
    implementationBinding: 'householdShoppingModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: true,
    bootMode: 'always',
    statusText: 'Always-on household shopping infrastructure.',
  },
  {
    canonicalId: 'home-state',
    manifestDirectory: 'home-state',
    tier: 'system',
    implementationBinding: 'homeStateModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: false,
    bootMode: 'manual',
    statusText: 'Phase 6 ambient surface module managed by home-node flows, not CLI module toggles.',
  },
  {
    canonicalId: 'voice',
    manifestDirectory: 'voice',
    tier: 'system',
    implementationBinding: 'voiceModule',
    implementationAvailable: true,
    aliases: [],
    userToggleable: false,
    visibleInCli: false,
    bootMode: 'manual',
    statusText: 'Managed through dedicated voice commands and home-node flows, not CLI module toggles.',
  },
] as const satisfies readonly FirstPartyModuleCatalogEntry[];

const catalogByCanonicalId = new Map(
  firstPartyModuleCatalog.map((entry) => [entry.canonicalId, entry] as const),
);

const catalogByIdentifier = new Map<string, FirstPartyModuleCatalogEntry>();
for (const entry of firstPartyModuleCatalog) {
  catalogByIdentifier.set(entry.canonicalId, entry);
  for (const alias of entry.aliases) {
    catalogByIdentifier.set(alias, entry);
  }
}

export function getFirstPartyModuleCatalog(): readonly FirstPartyModuleCatalogEntry[] {
  return firstPartyModuleCatalog;
}

export function findFirstPartyModuleCatalogEntry(
  moduleId: string,
): FirstPartyModuleCatalogEntry | undefined {
  return catalogByIdentifier.get(moduleId.trim().toLowerCase());
}

export function resolveFirstPartyModuleId(moduleId: string): string {
  return findFirstPartyModuleCatalogEntry(moduleId)?.canonicalId ?? moduleId.trim().toLowerCase();
}

export function listFirstPartyModulesByTier(tier: ModuleTier): string[] {
  return firstPartyModuleCatalog
    .filter((entry) => entry.tier === tier)
    .map((entry) => entry.canonicalId);
}

export function listVisibleFirstPartyModules(): readonly FirstPartyModuleCatalogEntry[] {
  return firstPartyModuleCatalog.filter((entry) => entry.visibleInCli);
}

export function getFirstPartyModuleManifestDirectory(moduleId: string): string {
  return findFirstPartyModuleCatalogEntry(moduleId)?.manifestDirectory ?? moduleId.trim().toLowerCase();
}

export function isFirstPartyModule(moduleId: string): boolean {
  return catalogByCanonicalId.has(moduleId.trim().toLowerCase());
}