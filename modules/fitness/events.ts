import { Topics, type BaseEvent } from '@lifeos/event-bus';

export type FitnessHealthUpdateEvent = BaseEvent<{
  metric: string;
  value: number;
  unit: string;
}>;

export type FitnessGoalUpdatedEvent = BaseEvent<{
  goalId: string;
  progress: number;
}>;

export const subscriptions: string[] = [
  Topics.health.changed,
  Topics.goal.updated,
  Topics.task.statusChanged,
];

export const emissions: string[] = [Topics.health.changed, Topics.goal.updated];
