export const moduleConfig = {
  id: 'economics-lite',
  version: '0.1.0',
  category: 'economics',
  schedule: {
    planning_interval: 'P1D',
  },
  triggers: ['goal.updated', 'task.status.changed', 'automation.trigger.fired'],
  settings: {
    budget_review_day: 'monday',
    rolling_window_days: 30,
  },
};
