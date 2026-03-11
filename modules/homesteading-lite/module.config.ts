export const moduleConfig = {
  id: 'homesteading-lite',
  version: '0.1.0',
  category: 'production',
  schedule: {
    planning_interval: 'P1D',
  },
  triggers: ['automation.trigger.fired', 'goal.updated'],
  settings: {
    default_zone: 'backyard',
    forecast_window_days: 10,
  },
};
