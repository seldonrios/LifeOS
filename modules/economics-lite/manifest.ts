import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: 'economics-lite',
  name: 'Economics Lite Module',
  version: '0.1.0',
  provides: [
    {
      capability: 'module.economics.budgeting',
      version: '0.1.0',
      description: 'Supports budget and opportunity tracking.',
    },
  ],
  requires: [
    { capability: 'core.life_graph', version_range: '^1.0.0' },
    { capability: 'core.goal_engine', version_range: '^1.0.0' },
  ],
  optional: [{ capability: 'ai.llm.chat', version_range: '^1.0.0' }],
  permissions: ['life_graph_read', 'life_graph_write', 'event_publish', 'event_subscribe'],
  degraded_modes: [
    {
      name: 'manual_entry_only',
      description: 'Disables assisted analysis and keeps manual budget workflows only.',
      disabled_features: ['automated_insights'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
