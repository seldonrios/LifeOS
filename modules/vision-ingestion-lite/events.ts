import { Topics, type BaseEvent } from '@lifeos/event-bus';

export type VisionTriggerEvent = BaseEvent<{
  source: string;
  reason: string;
}>;

export type VisionAnalysisCompletedEvent = BaseEvent<{
  captureId: string;
  summary: string;
}>;

export const subscriptions: string[] = [Topics.automation.triggerFired, Topics.device.stateChanged];

export const emissions: string[] = [Topics.automation.actionExecuted, Topics.agent.workCompleted];
