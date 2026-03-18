import { randomUUID } from 'node:crypto';

import type { BaseEvent, EventBus as EventBusClient } from '@lifeos/event-bus';
import type { DegradedMarker } from '@lifeos/secrets';

import type { ModuleDiagnostic, StartupReport } from './types';

function getRecommendations(
  diagnostics: ModuleDiagnostic[],
  degradedSecrets: DegradedMarker[],
): string[] {
  const recommendations = new Set<string>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.state === 'error' && diagnostic.reason) {
      recommendations.add(`Module '${diagnostic.id}': ${diagnostic.reason}`);
    }

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

  for (const marker of degradedSecrets) {
    recommendations.add(`${marker.reason} Service is running degraded.`);
  }

  return [...recommendations];
}

export function buildStartupReport(
  profile: string,
  diagnostics: ModuleDiagnostic[],
  degradedSecrets: DegradedMarker[] = [],
): StartupReport {
  return {
    profile,
    modules: diagnostics,
    degradedSecrets,
    recommendations: getRecommendations(diagnostics, degradedSecrets),
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

  console.log(
    JSON.stringify({
      message: 'Startup Diagnostics Report',
      report,
    }),
  );

  try {
    await eventBus.publish('system.startup.report', event);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown publish error';
    console.warn(
      JSON.stringify({
        message: 'event bus unavailable, skipping publish',
        error: message,
      }),
    );
  }
}
