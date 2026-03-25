import type { ModuleSchema } from '@lifeos/life-graph';

export const emailSummarizerSchema: ModuleSchema = {
  meta: {
    id: 'lifeos.module.email-summarizer',
    version: '0.1.0',
    module: 'email-summarizer',
  },
  entities: [
    {
      entity: 'email.Digest',
      properties: {
        subject: 'string',
        from: 'string',
        summary: 'string',
        messageId: 'string',
        receivedAt: 'datetime',
        read: 'boolean',
        accountLabel: 'string',
      },
    },
  ],
  relationships: [],
  properties: [],
  rules: [],
};
