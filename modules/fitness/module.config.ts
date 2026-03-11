export const moduleConfig = {
  id: 'fitness',
  version: '0.1.0',
  category: 'health',
  schedule: {
    planning_interval: 'PT6H',
  },
  triggers: ['health.changed', 'goal.updated', 'task.status.changed'],
  settings: {
    default_coaching_intensity: 'moderate',
    min_recovery_hours: 12,
  },
};
