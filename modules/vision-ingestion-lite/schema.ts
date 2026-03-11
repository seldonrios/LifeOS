import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'vision-ingestion-lite.schema',
    version: '0.1.0',
    module: 'vision-ingestion-lite',
  },
  entities: [
    {
      entity: 'vision.ImageCapture',
      properties: {
        captured_at: 'string',
        source: 'string',
        uri: 'string',
      },
    },
    {
      entity: 'vision.AnalysisResult',
      properties: {
        model: 'string',
        summary: 'string',
        confidence: 'number',
      },
    },
  ],
  relationships: [
    {
      type: 'vision.capture.has_analysis',
      from: 'vision.ImageCapture',
      to: 'vision.AnalysisResult',
    },
  ],
  properties: [
    {
      target: 'Event',
      property: 'capture_id',
      type: 'string',
      required: false,
    },
  ],
};
