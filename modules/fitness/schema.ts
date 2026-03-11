import type { ModuleSchema } from '@lifeos/life-graph';

export const moduleSchema: ModuleSchema = {
  meta: {
    id: 'fitness.schema',
    version: '0.1.0',
    module: 'fitness',
  },
  entities: [
    {
      entity: 'fitness.Workout',
      properties: {
        title: 'string',
        duration_minutes: 'number',
        intensity: 'string',
        completed_at: 'string',
      },
    },
    {
      entity: 'fitness.HealthMetric',
      properties: {
        metric: 'string',
        value: 'number',
        unit: 'string',
        observed_at: 'string',
      },
    },
  ],
  relationships: [
    {
      type: 'fitness.workout.measures',
      from: 'fitness.Workout',
      to: 'fitness.HealthMetric',
      properties: {
        context: 'string',
      },
    },
  ],
  properties: [
    {
      target: 'Goal',
      property: 'fitness_focus',
      type: 'string',
      required: false,
    },
  ],
  rules: [
    {
      id: 'fitness.recovery.rule',
      description: 'High-intensity workouts require a minimum recovery window.',
      condition: 'fitness.Workout.intensity == "high"',
      effect: 'recommend_recovery_session',
    },
  ],
};
