export const moduleConfig = {
  id: 'vision-ingestion-lite',
  version: '0.1.0',
  category: 'automation',
  schedule: {
    planning_interval: 'PT10M',
  },
  triggers: ['automation.trigger.fired', 'device.state.changed'],
  settings: {
    capture_interval_seconds: 60,
    max_frame_width: 1280,
  },
};
