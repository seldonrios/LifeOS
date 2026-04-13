import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';
type ClassifiedIntent = 'task_add' | 'calendar_add' | 'note_add' | 'note_search' | 'question_time' | 'weather' | 'news' | 'email_summarize' | 'research' | 'briefing' | 'next_actions' | 'preference_set' | 'health_log' | 'health_query' | 'unknown';
interface IntentClassification {
    intent: ClassifiedIntent;
    payload: Record<string, unknown>;
}
export declare const INTENT_PROMPT = "You are LifeOS intent parser. Return ONLY JSON.\n\n{\n  \"intent\": \"task_add | calendar_add | note_add | note_search | question_time | weather | news | email_summarize | research | briefing | next_actions | preference_set | health_log | health_query | unknown\",\n  \"payload\": {}\n}";
export interface IntentOutcome {
    handled: boolean;
    action: 'task_added' | 'next_actions' | 'time_reported' | 'agent_work_requested' | 'preference_updated' | 'unhandled';
    responseText: string;
    planId?: string;
    taskId?: string;
}
export type VoiceEventPublisher = (topic: string, data: Record<string, unknown>, source?: string) => Promise<void>;
type IntentClassifier = (text: string) => Promise<IntentClassification>;
export interface IntentRouterOptions {
    env?: NodeJS.ProcessEnv;
    graphPath?: string;
    client?: LifeGraphClient;
    createLifeGraphClient?: typeof createLifeGraphClient;
    publish?: VoiceEventPublisher;
    now?: () => Date;
    classifyIntent?: IntentClassifier;
    logger?: (message: string) => void;
    classifierTimeoutMs?: number;
}
export declare class IntentRouter {
    private readonly client;
    private readonly publish;
    private readonly now;
    private readonly classifyIntent;
    private readonly logger;
    constructor(options?: IntentRouterOptions);
    handleCommand(text: string): Promise<IntentOutcome>;
    private fallbackIntent;
    private handleTaskAddIntent;
    private handleNextActionsIntent;
    private handleTimeIntent;
    private handleAgentIntent;
    private intentConfirmation;
    private handlePreferenceIntent;
    private buildIntentPayload;
    private handleCalendarIntent;
    private handleUnknownIntent;
    private handleTaskIntent;
    private publishSafe;
}
export {};
