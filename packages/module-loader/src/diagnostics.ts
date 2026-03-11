import { randomUUID } from 'node:crypto';

import type { BaseEvent, EventBus as EventBusClient } from '@lifeos/event-bus';

import type { ModuleDiagnostic, StartupReport } from './types';

function getRecommendations(diagnostics: ModuleDiagnostic[]): string[] {
  const recommendations = new Set<string>();

  for (const diagnostic of diagnostics) {
    for (const capability of diagnostic.missingProviders) {
      recommendations.add(
        `Register a healthy provider for '${capability}' to enable module '${diagnostic.id}'.`,
      );
      if (capability.toLowerCase().includes('voice')) {
        recommendations.add('Enable voice feature gate to activate voice module.');
      }
    }

    for (const capability of diagnostic.missingOptional) {
      recommendations.add(
        `Add optional provider '${capability}' to improve module '${diagnostic.id}'.`,
      );
    }

    for (const warning of diagnostic.hardwareWarnings) {
      recommendations.add(
        `Install or enable hardware capability '${warning}' for module '${diagnostic.id}'.`,
      );
    }
  }

  return [...recommendations];
}

export function buildStartupReport(
  profile: string,
  diagnostics: ModuleDiagnostic[],
): StartupReport {
  return {
    profile,
    modules: diagnostics,
    recommendations: getRecommendations(diagnostics),
    emittedAt: new Date().toISOString(),
  };
}

export async function emitStartupReport(
  report: StartupReport,
  eventBus: EventBusClient,
): Promise<void> {
  const event: BaseEvent<StartupReport> = {
    id: randomUUID(),
    type: 'system.startup.report',
    timestamp: new Date().toISOString(),
    source: 'module-loader',
    version: '1.0.0',
    data: report,
  };

  await eventBus.publish('system.startup.report', event);

  console.log(
    JSON.stringify({
      message: 'Startup Diagnostics Report',
      report,
    }),
  );
}
