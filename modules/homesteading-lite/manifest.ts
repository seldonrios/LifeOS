import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: 'homesteading-lite',
  name: 'Homesteading Lite Module',
  version: '0.1.0',
  category: 'environment',
  runtime_profiles: ['assistant', 'production'],
  provides: [
    {
      capability: 'module.homestead.planning',
      version: '0.1.0',
      description: 'Coordinates small-scale production and harvest planning.',
    },
  ],
  requires: [
    { capability: 'core.life_graph', version_range: '^1.0.0' },
    { capability: 'service.weather.forecast', version_range: '^1.0.0' },
  ],
  optional: [
    {
      capability: 'perception.vision.plant_assessment',
      version_range: '^1.0.0',
    },
  ],
  permissions: ['life_graph_read', 'life_graph_write', 'event_publish', 'event_subscribe'],
  degraded_modes: [
    {
      name: 'no_harvest_scheduling',
      description:
        'Harvest timing automation is disabled when weather forecast capability is missing.',
      disabled_features: ['harvest_scheduling'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
