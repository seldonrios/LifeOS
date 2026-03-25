import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'health-tracker-schema',
    version: '0.1.0',
    module: 'health-tracker',
  },
  entities: [
    {
      entity: 'health.MetricEntry',
      properties: {
        metric: 'string',
        value: 'number',
        unit: 'string',
        note: 'string',
        loggedAt: 'datetime',
      },
    },
    {
      entity: 'health.DailyStreak',
      properties: {
        metric: 'string',
        currentStreak: 'number',
        longestStreak: 'number',
        lastLoggedDate: 'date',
      },
    },
  ],
  relationships: [
    {
      type: 'health.entry.contributes_to',
      from: 'health.MetricEntry',
      to: 'Goal',
      properties: {
        source: 'string',
      },
    },
  ],
  properties: [],
};
