export const moduleConfig = {
  id: 'calendar',
  version: '0.1.0',
  category: 'automation',
  schedule: {
    planning_interval: 'PT1H',
  },
  triggers: ['goal.updated', 'task.scheduled', 'task.status.changed'],
  settings: {
    reminder_lead_minutes: 30,
    workday_start: '08:00',
  },
};
