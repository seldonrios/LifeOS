import type { ModuleManifest } from '@lifeos/capability-registry';

export const manifest: ModuleManifest = {
  id: 'calendar',
  name: 'Calendar Module',
  version: '0.1.0',
  provides: [
    {
      capability: 'module.calendar.scheduler',
      version: '0.1.0',
      description: 'Schedules tasks and reminders aligned to active goals.',
    },
  ],
  requires: [
    { capability: 'core.life_graph', version_range: '^1.0.0' },
    { capability: 'core.goal_engine', version_range: '^1.0.0' },
  ],
  optional: [{ capability: 'comms.email', version_range: '^1.0.0' }],
  permissions: ['calendar_read', 'calendar_write', 'event_publish', 'event_subscribe'],
  degraded_modes: [
    {
      name: 'no_email_reminders',
      description: 'Disables outbound email reminder delivery when email provider is unavailable.',
      disabled_features: ['email_reminders'],
    },
  ],
  entrypoint: {
    type: 'module',
    path: './agent.ts',
  },
};

export default manifest;
