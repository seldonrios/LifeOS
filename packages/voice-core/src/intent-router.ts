import { randomUUID } from 'node:crypto';

import { Topics } from '@lifeos/event-bus';
import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';

const MAX_TASK_TITLE_CHARS = 160;
const MAX_COMMAND_TEXT_CHARS = 600;
const MAX_DESCRIPTION_CHARS = 1200;

type ClassifiedIntent =
  | 'task_add'
  | 'calendar_add'
  | 'question_time'
  | 'weather'
  | 'research'
  | 'next_actions'
  | 'unknown';

interface IntentClassification {
  intent: ClassifiedIntent;
  payload: Record<string, unknown>;
}

export const INTENT_PROMPT = `You are LifeOS intent parser. Return ONLY JSON.

{
  "intent": "task_add | calendar_add | question_time | weather | research | next_actions | unknown",
  "payload": {}
}`;

export interface IntentOutcome {
  handled: boolean;
  action: 'task_added' | 'next_actions' | 'time_reported' | 'agent_work_requested' | 'unhandled';
  responseText: string;
  planId?: string;
  taskId?: string;
}

export type VoiceEventPublisher = (
  topic: string,
  data: Record<string, unknown>,
  source?: string,
) => Promise<void>;

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

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/[.?!]+$/g, '');
  if (!trimmed) {
    return 'Untitled task';
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractTaskTitle(text: string): string | null {
  const normalized = text.trim();
  const patterns = [
    /^add(?: me)?(?: an?| another)? task(?: to)?\s+(.+)$/i,
    /^remind me to\s+(.+)$/i,
    /^remember to\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return sentenceCase(candidate);
    }
  }

  return null;
}

function normalizeClassifiedIntent(value: unknown): ClassifiedIntent {
  if (
    value === 'task_add' ||
    value === 'calendar_add' ||
    value === 'question_time' ||
    value === 'weather' ||
    value === 'research' ||
    value === 'next_actions'
  ) {
    return value;
  }

  return 'unknown';
}

function parseClassificationResponse(raw: string): IntentClassification {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    return {
      intent: 'unknown',
      payload: {},
    };
  }

  const candidate = parsed as { intent?: unknown; payload?: unknown };
  const payload =
    candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)
      ? (candidate.payload as Record<string, unknown>)
      : {};

  return {
    intent: normalizeClassifiedIntent(candidate.intent),
    payload,
  };
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

function resolveClassifierTimeoutMs(
  env: NodeJS.ProcessEnv | undefined,
  configuredTimeoutMs: number | undefined,
): number {
  if (Number.isFinite(configuredTimeoutMs) && (configuredTimeoutMs ?? 0) > 0) {
    return Math.floor(configuredTimeoutMs as number);
  }

  const fromEnv = Number.parseInt(env?.LIFEOS_VOICE_CLASSIFIER_TIMEOUT_MS?.trim() ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return 4000;
}

function createOllamaIntentClassifier(
  env?: NodeJS.ProcessEnv,
  configuredTimeoutMs?: number,
): IntentClassifier {
  const model = env?.LIFEOS_VOICE_MODEL?.trim() || env?.LIFEOS_GOAL_MODEL?.trim() || 'llama3.1:8b';
  const host = env?.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434';
  const endpoint = `${host.replace(/\/+$/, '')}/api/chat`;
  const timeoutMs = resolveClassifierTimeoutMs(env, configuredTimeoutMs);

  return async (text: string): Promise<IntentClassification> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.1,
            num_ctx: 4096,
          },
          messages: [
            {
              role: 'system',
              content: INTENT_PROMPT,
            },
            {
              role: 'user',
              content: text.trim().slice(0, 800),
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error as { name?: unknown }).name === 'AbortError')
      ) {
        throw new Error(`Intent classification timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Intent classification failed (${response.status})`);
    }

    const data = (await response.json()) as {
      message?: {
        content?: unknown;
      };
    };
    const content = data.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Intent classifier returned invalid content');
    }

    return parseClassificationResponse(content);
  };
}

async function noopPublish(): Promise<void> {
  return;
}

export class IntentRouter {
  private readonly client: LifeGraphClient;
  private readonly publish: VoiceEventPublisher;
  private readonly now: () => Date;
  private readonly classifyIntent: IntentClassifier;
  private readonly logger: (message: string) => void;

  constructor(options: IntentRouterOptions = {}) {
    const createClient = options.createLifeGraphClient ?? createLifeGraphClient;
    const clientOptions: Parameters<typeof createLifeGraphClient>[0] = {};
    if (options.env) {
      clientOptions.env = options.env;
    }
    if (options.graphPath) {
      clientOptions.graphPath = options.graphPath;
    }
    this.client = options.client ?? createClient(clientOptions);
    this.publish = options.publish ?? noopPublish;
    this.now = options.now ?? (() => new Date());
    this.classifyIntent =
      options.classifyIntent ??
      createOllamaIntentClassifier(options.env, options.classifierTimeoutMs);
    this.logger = options.logger ?? (() => undefined);
  }

  async handleCommand(text: string): Promise<IntentOutcome> {
    const normalizedText = clampText(text, MAX_COMMAND_TEXT_CHARS);
    if (!normalizedText) {
      return this.handleUnknownIntent('');
    }

    let classification: IntentClassification = { intent: 'unknown', payload: {} };
    try {
      classification = await this.classifyIntent(normalizedText);
    } catch (error: unknown) {
      this.logger(
        `[voice.router] classifier degraded, using fallback heuristics: ${normalizeErrorMessage(error)}`,
      );
      // Keep command flow local-first even if local LLM is unavailable.
      classification = {
        intent: this.fallbackIntent(normalizedText),
        payload: {},
      };
    }

    switch (classification.intent) {
      case 'task_add':
        return this.handleTaskAddIntent(normalizedText, classification.payload);
      case 'next_actions':
        return this.handleNextActionsIntent(normalizedText);
      case 'question_time':
        return this.handleTimeIntent(normalizedText);
      case 'calendar_add':
        return this.handleAgentIntent(normalizedText, 'calendar', classification.payload);
      case 'weather':
        return this.handleAgentIntent(normalizedText, 'weather', classification.payload);
      case 'research':
        return this.handleAgentIntent(normalizedText, 'research', classification.payload);
      default:
        return this.handleUnknownIntent(normalizedText);
    }
  }

  private fallbackIntent(text: string): ClassifiedIntent {
    const lower = text.toLowerCase();
    if (extractTaskTitle(text)) {
      return 'task_add';
    }
    if (
      lower.includes("what's next") ||
      lower.includes('what is next') ||
      lower.includes('next task')
    ) {
      return 'next_actions';
    }
    if (
      lower.includes('what time is it') ||
      lower.includes("what's the time") ||
      lower === 'time' ||
      lower.includes('current time')
    ) {
      return 'question_time';
    }
    if (lower.includes('calendar') || lower.includes('schedule')) {
      return 'calendar_add';
    }
    if (lower.includes('weather')) {
      return 'weather';
    }
    if (lower.includes('research')) {
      return 'research';
    }
    return 'unknown';
  }

  private async handleTaskAddIntent(
    text: string,
    payload: Record<string, unknown>,
  ): Promise<IntentOutcome> {
    const taskTitleRaw =
      getString(payload.title) ??
      getString(payload.task) ??
      getString(payload.name) ??
      extractTaskTitle(text) ??
      sentenceCase(text);
    const taskTitle = clampText(taskTitleRaw, MAX_TASK_TITLE_CHARS) || 'Untitled task';

    return this.handleTaskIntent(text, taskTitle);
  }

  private async handleNextActionsIntent(text: string): Promise<IntentOutcome> {
    const review = await this.client.generateReview('daily');
    const firstAction = review.nextActions[0] ?? 'You do not have any queued next actions.';
    const responseText =
      review.nextActions.length > 0 ? `Your next action is ${firstAction}.` : firstAction;

    await this.publishSafe(Topics.lifeos.voiceCommandProcessed, {
      action: 'next_actions',
      text,
      responseText,
    });

    return {
      handled: true,
      action: 'next_actions',
      responseText,
    };
  }

  private async handleTimeIntent(text: string): Promise<IntentOutcome> {
    const timeIso = this.now().toISOString();
    const responseText = `Current local time snapshot: ${timeIso}.`;
    await this.publishSafe(Topics.lifeos.voiceCommandProcessed, {
      action: 'time_reported',
      text,
      responseText,
      at: timeIso,
    });
    return {
      handled: true,
      action: 'time_reported',
      responseText,
    };
  }

  private async handleAgentIntent(
    text: string,
    intent: 'calendar' | 'weather' | 'research',
    payload: Record<string, unknown>,
  ): Promise<IntentOutcome> {
    await this.publishSafe(Topics.agent.workRequested, {
      utterance: text,
      intent,
      payload,
      requestedAt: this.now().toISOString(),
      origin: 'voice-core',
    });
    const responseText = `Queued that for the ${intent} flow.`;
    await this.publishSafe(Topics.lifeos.voiceCommandProcessed, {
      action: 'agent_work_requested',
      text,
      responseText,
      intent,
    });
    return {
      handled: true,
      action: 'agent_work_requested',
      responseText,
    };
  }

  private async handleUnknownIntent(text: string): Promise<IntentOutcome> {
    await this.publishSafe(Topics.lifeos.voiceCommandUnhandled, {
      text,
    });

    return {
      handled: false,
      action: 'unhandled',
      responseText: 'I heard you, but I do not know how to do that yet.',
    };
  }

  private async handleTaskIntent(text: string, taskTitle: string): Promise<IntentOutcome> {
    const createdAt = this.now().toISOString();
    const planId = `goal_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const planTitle = `Voice task: ${clampText(taskTitle, MAX_TASK_TITLE_CHARS) || 'Untitled task'}`;
    const trimmedCommand = clampText(text, MAX_DESCRIPTION_CHARS);

    await this.client.createNode('plan', {
      id: planId,
      createdAt,
      title: planTitle,
      description: `Created from voice command: "${trimmedCommand}"`,
      tasks: [
        {
          id: taskId,
          title: clampText(taskTitle, MAX_TASK_TITLE_CHARS) || 'Untitled task',
          status: 'todo',
          priority: 4,
        },
      ],
    });

    await this.publishSafe(Topics.plan.created, {
      planId,
      title: planTitle,
      createdAt,
      origin: 'voice',
    });
    await this.publishSafe(Topics.task.scheduled, {
      taskId,
      planId,
      title: taskTitle,
      scheduledAt: createdAt,
      origin: 'voice',
    });
    await this.publishSafe(Topics.lifeos.voiceCommandProcessed, {
      action: 'task_added',
      text,
      planId,
      taskId,
    });

    return {
      handled: true,
      action: 'task_added',
      responseText: `Added a task to ${taskTitle}.`,
      planId,
      taskId,
    };
  }

  private async publishSafe(topic: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.publish(topic, data, 'voice-core');
    } catch (error: unknown) {
      this.logger(`[voice.router] publish failed topic=${topic}: ${normalizeErrorMessage(error)}`);
    }
  }
}
