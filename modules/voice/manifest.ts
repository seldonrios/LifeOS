import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: 'voice',
  name: 'Voice Module',
  version: '0.1.0',
  category: 'interface',
  runtime_profiles: ['assistant', 'ambient', 'multimodal', 'production'],
  provides: [
    {
      capability: 'module.voice.orchestration',
      version: '0.1.0',
      description: 'Handles speech-driven command orchestration.',
    },
  ],
  requires: [
    { capability: 'ai.llm.chat', version_range: '^1.0.0' },
    { capability: 'media.voice.stt', version_range: '^1.0.0' },
    { capability: 'media.voice.tts', version_range: '^1.0.0' },
  ],
  optional: [{ capability: 'context.room_presence', version_range: '^1.0.0' }],
  hardware: [
    { id: 'sensor.microphone', description: 'Microphone input device', required: true },
    { id: 'audio.speaker', description: 'Speaker output device', required: true },
  ],
  permissions: ['event_publish', 'event_subscribe', 'device_control', 'llm_invoke'],
  degraded_modes: [
    {
      name: 'disabled_without_stt',
      description: 'Voice module is disabled when speech-to-text is unavailable.',
      disabled_features: ['voice_commands', 'hands_free_flow'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
