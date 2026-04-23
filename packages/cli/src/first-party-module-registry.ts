import {
  findFirstPartyModuleCatalogEntry,
  getFirstPartyModuleCatalog,
  type FirstPartyImplementationBinding,
  type FirstPartyModuleCatalogEntry,
} from '@lifeos/core';
import { calendarModule } from '@lifeos/calendar-module';
import {
  emailSummarizerModule,
  type ImapCredentials,
  getCredentialsFilePath,
  readCredentials,
  writeCredentials,
} from '@lifeos/email-summarizer-module';
import { googleBridgeModule } from '@lifeos/google-bridge';
import { habitStreakModule } from '@lifeos/habit-streak-module';
import { healthTrackerModule } from '@lifeos/health-tracker-module';
import { homeStateModule } from '@lifeos/home-state-module';
import { householdCaptureRouterModule } from '@lifeos/household-capture-router-module';
import { householdChoresModule } from '@lifeos/household-chores-module';
import { householdShoppingModule } from '@lifeos/household-shopping-module';
import { type LifeOSModule } from '@lifeos/module-loader';
import { newsModule } from '@lifeos/news-module';
import { notesModule } from '@lifeos/notes-module';
import { orchestratorModule } from '@lifeos/orchestrator';
import { reminderModule } from '@lifeos/reminder-module';
import { researchModule } from '@lifeos/research-module';
import { schedulerModule } from '@lifeos/scheduler-module';
import { syncModule } from '@lifeos/sync-core';
import { voiceModule } from '@lifeos/voice-module';
import { weatherModule } from '@lifeos/weather-module';

export { getCredentialsFilePath, readCredentials, writeCredentials, type ImapCredentials };

const runtimeBindings: Record<FirstPartyImplementationBinding, LifeOSModule> = {
  calendarModule,
  emailSummarizerModule,
  googleBridgeModule,
  habitStreakModule,
  healthTrackerModule,
  homeStateModule,
  householdCaptureRouterModule,
  householdChoresModule,
  householdShoppingModule,
  newsModule,
  notesModule,
  orchestratorModule,
  reminderModule,
  researchModule,
  schedulerModule,
  syncModule,
  voiceModule,
  weatherModule,
};

export interface CliFirstPartyModuleEntry extends FirstPartyModuleCatalogEntry {
  implementation: LifeOSModule | null;
  identifiers: string[];
}

function dedupeModules(modules: LifeOSModule[]): LifeOSModule[] {
  const byId = new Map<string, LifeOSModule>();
  for (const module of modules) {
    byId.set(module.id, module);
  }
  return Array.from(byId.values());
}

// Accepted Phase 3 MVP debt: first-party runtime composition stays centralized here until
// a later phase introduces a dynamic third-party discovery/runtime-loading model.
const cliFirstPartyModuleEntries = getFirstPartyModuleCatalog().map((entry) => ({
  ...entry,
  implementation: entry.implementationAvailable ? runtimeBindings[entry.implementationBinding] : null,
  identifiers: [entry.canonicalId, ...entry.aliases],
}));

const cliModuleByIdentifier = new Map<string, CliFirstPartyModuleEntry>();
for (const entry of cliFirstPartyModuleEntries) {
  for (const identifier of entry.identifiers) {
    cliModuleByIdentifier.set(identifier, entry);
  }
}

export function listCliFirstPartyModuleEntries(
  options: { visibleOnly?: boolean } = {},
): readonly CliFirstPartyModuleEntry[] {
  if (options.visibleOnly) {
    return cliFirstPartyModuleEntries.filter((entry) => entry.visibleInCli);
  }
  return cliFirstPartyModuleEntries;
}

export function listCliLoadableModules(): readonly CliFirstPartyModuleEntry[] {
  return cliFirstPartyModuleEntries.filter((entry) => entry.implementation !== null);
}

export function findCliFirstPartyModuleEntry(moduleId: string): CliFirstPartyModuleEntry | undefined {
  return cliModuleByIdentifier.get(moduleId.trim().toLowerCase());
}

export function getCliFirstPartyModuleImplementation(moduleId: string): LifeOSModule | null {
  return findCliFirstPartyModuleEntry(moduleId)?.implementation ?? null;
}

export function listCliBootRuntimeModules(enabledOptionalModules: string[]): LifeOSModule[] {
  const enabledSet = new Set(enabledOptionalModules);
  return dedupeModules(
    cliFirstPartyModuleEntries
      .filter((entry) => entry.implementation !== null)
      .filter((entry) => {
        if (entry.bootMode === 'always') {
          return true;
        }
        if (entry.bootMode === 'optional') {
          return enabledSet.has(entry.canonicalId);
        }
        return false;
      })
      .map((entry) => entry.implementation as LifeOSModule),
  );
}

export function listCliDefaultRuntimeModules(): LifeOSModule[] {
  return dedupeModules(
    cliFirstPartyModuleEntries
      .filter((entry) => entry.implementation !== null && entry.bootMode !== 'manual')
      .map((entry) => entry.implementation as LifeOSModule),
  );
}

export function resolveCliManifestDirectory(moduleId: string): string {
  return findFirstPartyModuleCatalogEntry(moduleId)?.manifestDirectory ?? moduleId.trim().toLowerCase();
}