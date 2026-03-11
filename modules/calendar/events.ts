import { Topics, type BaseEvent } from '@lifeos/event-bus';

export type CalendarScheduleEvent = BaseEvent<{
  taskId: string;
  startsAt: string;
  endsAt?: string;
}>;

export type CalendarAutomationTriggerEvent = BaseEvent<{
  trigger: string;
  payload: Record<string, unknown>;
}>;

export const subscriptions: string[] = [
  Topics.goal.updated,
  Topics.task.scheduled,
  Topics.task.statusChanged,
];

export const emissions: string[] = [Topics.task.scheduled, Topics.automation.triggerFired];
