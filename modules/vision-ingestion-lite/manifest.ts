import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: 'vision-ingestion-lite',
  name: 'Vision Ingestion Lite Module',
  version: '0.1.0',
  category: 'perception',
  runtime_profiles: ['ambient', 'multimodal', 'production'],
  provides: [
    {
      capability: 'module.vision.ingestion',
      version: '0.1.0',
      description: 'Ingests camera captures and emits structured analysis events.',
    },
  ],
  requires: [
    {
      capability: 'perception.vision.image_understanding',
      version_range: '^1.0.0',
    },
  ],
  optional: [{ capability: 'compute.gpu.cuda', version_range: '^1.0.0' }],
  hardware: [{ id: 'sensor.camera', description: 'Camera capture device', required: true }],
  permissions: ['event_publish', 'event_subscribe', 'device_control'],
  degraded_modes: [
    {
      name: 'cpu_inference',
      description: 'Falls back to CPU-only image understanding when CUDA is unavailable.',
      disabled_features: ['high_throughput_batch_inference'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
