import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'calendar.schema',
    version: '0.1.0',
    module: 'calendar',
  },
  entities: [
    {
      entity: 'calendar.CalendarEvent',
      properties: {
        title: 'string',
        starts_at: 'string',
        ends_at: 'string',
        status: 'string',
      },
    },
    {
      entity: 'calendar.Reminder',
      properties: {
        due_at: 'string',
        channel: 'string',
        sent: 'boolean',
      },
    },
  ],
  relationships: [
    {
      type: 'calendar.event.has_reminder',
      from: 'calendar.CalendarEvent',
      to: 'calendar.Reminder',
    },
  ],
  properties: [
    {
      target: 'Task',
      property: 'calendar_event_id',
      type: 'string',
      required: false,
    },
  ],
};
