import { Topics, type BaseEvent } from '@lifeos/event-bus';

export type VoiceWorkRequestedEvent = BaseEvent<{
  utterance: string;
  locale?: string;
}>;

export type VoiceWorkCompletedEvent = BaseEvent<{
  requestId: string;
  outcome: string;
}>;

export const subscriptions: string[] = [Topics.agent.workRequested, Topics.automation.triggerFired];

export const emissions: string[] = [Topics.agent.workCompleted, Topics.automation.actionExecuted];
