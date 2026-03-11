export const moduleConfig = {
  id: 'voice',
  version: '0.1.0',
  category: 'automation',
  schedule: {
    planning_interval: 'PT15M',
  },
  triggers: ['agent.work.requested', 'automation.trigger.fired'],
  settings: {
    wake_word: 'lifeos',
    max_session_seconds: 120,
  },
};
