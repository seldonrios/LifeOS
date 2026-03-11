import { Topics, type BaseEvent } from '@lifeos/event-bus';

export type HomesteadTriggerEvent = BaseEvent<{
  trigger: string;
  zone?: string;
}>;

export type HomesteadProductionTaskCreatedEvent = BaseEvent<{
  taskId: string;
  crop: string;
  dueDate?: string;
}>;

export const subscriptions: string[] = [Topics.automation.triggerFired, Topics.goal.updated];

export const emissions: string[] = [
  Topics.production.taskCreated,
  Topics.automation.actionExecuted,
];
