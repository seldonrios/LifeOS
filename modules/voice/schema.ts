import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'voice.schema',
    version: '0.1.0',
    module: 'voice',
  },
  entities: [
    {
      entity: 'voice.VoiceCommand',
      properties: {
        text: 'string',
        locale: 'string',
        received_at: 'string',
      },
    },
    {
      entity: 'voice.VoiceSession',
      properties: {
        started_at: 'string',
        ended_at: 'string',
        status: 'string',
      },
    },
  ],
  relationships: [
    {
      type: 'voice.session.includes_command',
      from: 'voice.VoiceSession',
      to: 'voice.VoiceCommand',
    },
  ],
  properties: [
    {
      target: 'Event',
      property: 'voice_session_id',
      type: 'string',
      required: false,
    },
  ],
};
