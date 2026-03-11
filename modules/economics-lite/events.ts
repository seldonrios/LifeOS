import { Topics, type BaseEvent } from '@lifeos/event-bus';

export type EconomicsGoalUpdatedEvent = BaseEvent<{
  goalId: string;
  targetDelta: number;
}>;

export type EconomicsPlanCreatedEvent = BaseEvent<{
  planId: string;
  title: string;
}>;

export const subscriptions: string[] = [
  Topics.goal.updated,
  Topics.task.statusChanged,
  Topics.automation.triggerFired,
];

export const emissions: string[] = [Topics.goal.updated, Topics.plan.created];
