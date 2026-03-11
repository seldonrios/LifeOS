import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: 'fitness',
  name: 'Fitness Module',
  version: '0.1.0',
  provides: [
    {
      capability: 'module.fitness.coaching',
      version: '0.1.0',
      description: 'Generates fitness coaching plans from life signals.',
    },
  ],
  requires: [
    { capability: 'core.life_graph', version_range: '^1.0.0' },
    { capability: 'core.goal_engine', version_range: '^1.0.0' },
  ],
  optional: [
    { capability: 'ai.llm.chat', version_range: '^1.0.0' },
    { capability: 'media.voice.tts', version_range: '^1.0.0' },
  ],
  permissions: ['life_graph_read', 'life_graph_write', 'event_publish', 'event_subscribe'],
  degraded_modes: [
    {
      name: 'rule_based_suggestions',
      description:
        'Falls back to deterministic fitness suggestions when chat capability is unavailable.',
      disabled_features: ['conversational_coaching'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
