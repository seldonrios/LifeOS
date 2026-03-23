import { randomUUID } from 'node:crypto';

import { Topics } from '@lifeos/event-bus';
import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';

const MAX_TASK_TITLE_CHARS = 160;
const MAX_COMMAND_TEXT_CHARS = 600;
const MAX_DESCRIPTION_CHARS = 1200;
const MAX_CALENDAR_TITLE_CHARS = 200;
const MAX_LOCATION_CHARS = 200;
const MAX_ATTENDEES = 20;
const MAX_ATTENDEE_CHARS = 120;
const MAX_NOTE_TITLE_CHARS = 200;
const MAX_NOTE_CONTENT_CHARS = 2000;
const MAX_NOTE_TAGS = 20;
const MAX_NOTE_TAG_CHARS = 40;
const MAX_PREFERENCE_KEY_CHARS = 80;
const MAX_PREFERENCE_VALUE_CHARS = 300;
const MIN_BRIEFING_SECONDS = 10;
const MAX_BRIEFING_SECONDS = 90;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PREFERENCE_KEY_ALIASES: Record<
  string,
  'communication_style' | 'priorities' | 'quirks' | 'briefing_max_seconds'
> = {
  communication_style: 'communication_style',
  communicationstyle: 'communication_style',
  style: 'communication_style',
  response_style: 'communication_style',
  briefing_style: 'communication_style',
  briefing_max_seconds: 'briefing_max_seconds',
  briefing_seconds: 'briefing_max_seconds',
  priority: 'priorities',
  priorities: 'priorities',
  quirk: 'quirks',
  quirks: 'quirks',
};

type ClassifiedIntent =
  | 'task_add'
  | 'calendar_add'
  | 'note_add'
  | 'note_search'
  | 'question_time'
  | 'weather'
  | 'news'
  | 'research'
  | 'briefing'
  | 'next_actions'
  | 'preference_set'
  | 'unknown';

interface IntentClassification {
  intent: ClassifiedIntent;
  payload: Record<string, unknown>;
}

export const INTENT_PROMPT = `You are LifeOS intent parser. Return ONLY JSON.

{
  "intent": "task_add | calendar_add | note_add | note_search | question_time | weather | news | research | briefing | next_actions | preference_set | unknown",
  "payload": {}
}`;

export interface IntentOutcome {
  handled: boolean;
  action:
    | 'task_added'
    | 'next_actions'
    | 'time_reported'
    | 'agent_work_requested'
    | 'preference_updated'
    | 'unhandled';
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

function getStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => getString(entry))
    .filter((entry): entry is string => entry !== null);
  return normalized.length > 0 ? normalized.slice(0, MAX_ATTENDEES) : null;
}

function parseDateTime(value: unknown): Date | null {
  const candidate = getString(value);
  if (!candidate) {
    return null;
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeCalendarStatus(value: unknown): 'confirmed' | 'tentative' | 'cancelled' {
  if (value === 'tentative' || value === 'cancelled') {
    return value;
  }
  return 'confirmed';
}

function normalizeDueDate(value: unknown): string | null {
  const candidate = getString(value);
  if (!candidate) {
    return null;
  }
  return DATE_ONLY_PATTERN.test(candidate) ? candidate : null;
}

function extractLocationFromText(text: string): string | null {
  const match = text.match(/\b(?:in|for)\s+([a-zA-Z][a-zA-Z\s-]{1,80})/i)?.[1];
  return match ? clampText(match, MAX_LOCATION_CHARS) : null;
}

function extractResearchQuery(text: string): string {
  const stripped = text.replace(
    /^(hey life(?:\s?os)?[,\s]*)?(research|look up|investigate)\s+/i,
    '',
  );
  return clampText(stripped || text, MAX_DESCRIPTION_CHARS);
}

function extractNoteContent(text: string): string {
  const stripped = text.replace(/^(hey life(?:\s?os)?[,\s]*)?(note that|note)\s+/i, '');
  return clampText(stripped || text, MAX_NOTE_CONTENT_CHARS);
}

function extractNoteSearchQuery(text: string): string {
  const stripped = text.replace(
    /^(hey life(?:\s?os)?[,\s]*)?(what did i note about|find notes? about|search notes? for)\s+/i,
    '',
  );
  return clampText(stripped || text, MAX_NOTE_CONTENT_CHARS);
}

function extractSinceDaysFromText(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes('last week')) {
    return 7;
  }
  if (lower.includes('yesterday')) {
    return 1;
  }
  if (lower.includes('last month')) {
    return 30;
  }
  return null;
}

function extractPreferenceFromText(text: string): { key: string; value: string } | null {
  const briefingSecondsMatch = text.match(
    /\b(?:keep\s+)?briefings?\s+(?:under|below|<=?|at most)\s*(\d{1,3})\s*seconds?\b/i,
  )?.[1];
  if (briefingSecondsMatch) {
    return {
      key: 'briefing_max_seconds',
      value: briefingSecondsMatch,
    };
  }

  const preferMatch = text.match(/^.*?\bi prefer\s+(.+)$/i)?.[1];
  if (preferMatch) {
    return {
      key: 'communication_style',
      value: clampText(preferMatch, MAX_PREFERENCE_VALUE_CHARS),
    };
  }

  const rememberMatch = text.match(/^.*?\bremember(?: that)? i\s+(.+)$/i)?.[1];
  if (rememberMatch) {
    return {
      key: 'quirks',
      value: clampText(`i ${rememberMatch}`, MAX_PREFERENCE_VALUE_CHARS),
    };
  }

  const prioritizeMatch = text.match(/^.*?\b(?:always\s+)?prioritize\s+(.+)$/i)?.[1];
  if (prioritizeMatch) {
    return {
      key: 'priorities',
      value: clampText(prioritizeMatch, MAX_PREFERENCE_VALUE_CHARS),
    };
  }

  return null;
}

function normalizePreferenceKey(
  raw: string | null,
): 'communication_style' | 'priorities' | 'quirks' | 'briefing_max_seconds' | null {
  if (!raw) {
    return null;
  }
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .slice(0, MAX_PREFERENCE_KEY_CHARS);
  return PREFERENCE_KEY_ALIASES[normalized] ?? null;
}

function normalizeBriefingSecondsValue(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const bounded = Math.max(MIN_BRIEFING_SECONDS, Math.min(MAX_BRIEFING_SECONDS, parsed));
  return String(bounded);
}

function isResearchFollowUpPhrase(text: string): boolean {
  return /^(tell me more|expand(?: on)?|continue|go deeper|what else|what about|elaborate(?: on)?)\b/i.test(
    text.trim(),
  );
}

function deriveNoteTitle(content: string): string {
  return clampText(
    content.split(/\s+/g).slice(0, 7).join(' ') || 'Voice note',
    MAX_NOTE_TITLE_CHARS,
  );
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
    value === 'note_add' ||
    value === 'note_search' ||
    value === 'question_time' ||
    value === 'weather' ||
    value === 'news' ||
    value === 'research' ||
    value === 'briefing' ||
    value === 'next_actions' ||
    value === 'preference_set' ||
    value === 'preference' ||
    value === 'preference_update'
  ) {
    return value === 'preference' || value === 'preference_update' ? 'preference_set' : value;
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

function normalizeClassification(input: IntentClassification): IntentClassification {
  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {};
  return {
    intent: normalizeClassifiedIntent((input as { intent?: unknown }).intent),
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
    classification = normalizeClassification(classification);

    switch (classification.intent) {
      case 'task_add':
        return this.handleTaskAddIntent(normalizedText, classification.payload);
      case 'next_actions':
        return this.handleNextActionsIntent(normalizedText);
      case 'question_time':
        return this.handleTimeIntent(normalizedText);
      case 'calendar_add':
        return this.handleAgentIntent(normalizedText, 'calendar', classification.payload);
      case 'note_add':
        return this.handleAgentIntent(normalizedText, 'note', classification.payload);
      case 'note_search':
        return this.handleAgentIntent(normalizedText, 'note_search', classification.payload);
      case 'weather':
        return this.handleAgentIntent(normalizedText, 'weather', classification.payload);
      case 'news':
        return this.handleAgentIntent(normalizedText, 'news', classification.payload);
      case 'research':
        return this.handleAgentIntent(normalizedText, 'research', classification.payload);
      case 'briefing':
        return this.handleAgentIntent(normalizedText, 'briefing', classification.payload);
      case 'preference_set':
        return this.handlePreferenceIntent(normalizedText, classification.payload);
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
    if (
      lower.includes('what did i note about') ||
      lower.includes('find note about') ||
      lower.includes('search notes for')
    ) {
      return 'note_search';
    }
    if (lower.startsWith('note ') || lower.includes('note that')) {
      return 'note_add';
    }
    if (lower.includes('weather')) {
      return 'weather';
    }
    if (lower.includes('news') || lower.includes('headlines')) {
      return 'news';
    }
    if (
      extractPreferenceFromText(text) ||
      lower.includes('i prefer') ||
      lower.includes('remember i') ||
      lower.includes('remember that i') ||
      lower.includes('prioritize')
    ) {
      return 'preference_set';
    }
    if (lower.includes('briefing') || lower.includes('good morning')) {
      return 'briefing';
    }
    if (lower.includes('research')) {
      return 'research';
    }
    if (isResearchFollowUpPhrase(text)) {
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
    const dueDate = normalizeDueDate(payload.dueDate) ?? normalizeDueDate(payload.date);

    return this.handleTaskIntent(text, taskTitle, dueDate);
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
    intent: 'calendar' | 'weather' | 'research' | 'note' | 'news' | 'note_search' | 'briefing',
    payload: Record<string, unknown>,
  ): Promise<IntentOutcome> {
    if (intent === 'calendar') {
      return this.handleCalendarIntent(text, payload);
    }

    const requestedAt = this.now().toISOString();
    const routedPayload = this.buildIntentPayload(intent, text, payload, requestedAt);
    const topicByIntent: Record<
      'weather' | 'research' | 'note' | 'news' | 'note_search' | 'briefing',
      string
    > = {
      weather: Topics.lifeos.voiceIntentWeather,
      research: Topics.lifeos.voiceIntentResearch,
      note: Topics.lifeos.voiceIntentNoteAdd,
      news: Topics.lifeos.voiceIntentNews,
      note_search: Topics.lifeos.voiceIntentNoteSearch,
      briefing: Topics.lifeos.voiceIntentBriefing,
    };

    await this.publishSafe(topicByIntent[intent], routedPayload);
    await this.publishSafe(Topics.agent.workRequested, {
      utterance: text,
      intent,
      payload: routedPayload,
      requestedAt,
      origin: 'voice-core',
    });
    const responseText = this.intentConfirmation(intent, routedPayload);
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

  private intentConfirmation(
    intent: 'weather' | 'research' | 'note' | 'news' | 'note_search' | 'briefing',
    payload: Record<string, unknown>,
  ): string {
    if (intent === 'weather') {
      const location = getString(payload.location) ?? 'your location';
      return `Checking weather for ${location}.`;
    }
    if (intent === 'research') {
      const query = getString(payload.query) ?? 'that topic';
      return `Researching ${query}.`;
    }
    if (intent === 'note') {
      return 'Noted. I will save that.';
    }
    if (intent === 'note_search') {
      const query = getString(payload.query) ?? 'that topic';
      return `Searching notes about ${query}.`;
    }
    if (intent === 'briefing') {
      return 'Preparing your daily briefing.';
    }
    return 'Preparing your news digest.';
  }

  private async handlePreferenceIntent(
    text: string,
    payload: Record<string, unknown>,
  ): Promise<IntentOutcome> {
    const parsed = extractPreferenceFromText(text);
    const key =
      normalizePreferenceKey(getString(payload.key)) ??
      normalizePreferenceKey(parsed?.key ?? null) ??
      'communication_style';
    const value = clampText(
      getString(payload.value) ?? parsed?.value ?? '',
      MAX_PREFERENCE_VALUE_CHARS,
    );
    if (!value) {
      return this.handleUnknownIntent(text);
    }
    const normalizedValue =
      key === 'briefing_max_seconds' ? normalizeBriefingSecondsValue(value) : value;
    if (!normalizedValue) {
      return this.handleUnknownIntent(text);
    }
    const requestedAt = this.now().toISOString();
    const normalizedPayload = {
      key,
      value: normalizedValue,
      utterance: text,
      requestedAt,
    };

    await this.publishSafe(Topics.lifeos.voiceIntentPreferenceSet, normalizedPayload);
    await this.publishSafe(Topics.lifeos.voiceCommandProcessed, {
      action: 'preference_updated',
      text,
      key,
      value: normalizedValue,
    });

    let responseText = 'Understood. I will remember that preference.';
    if (key === 'communication_style') {
      responseText = 'Understood. I will keep responses concise.';
    } else if (key === 'briefing_max_seconds') {
      responseText = `Understood. I will keep briefings under ${normalizedValue} seconds.`;
    }
    return {
      handled: true,
      action: 'preference_updated',
      responseText,
    };
  }

  private buildIntentPayload(
    intent: 'weather' | 'research' | 'note' | 'news' | 'note_search' | 'briefing',
    text: string,
    payload: Record<string, unknown>,
    requestedAt: string,
  ): Record<string, unknown> {
    if (intent === 'weather') {
      return {
        location: clampText(
          getString(payload.location) ?? extractLocationFromText(text) ?? 'current',
          MAX_LOCATION_CHARS,
        ),
        utterance: text,
        requestedAt,
      };
    }
    if (intent === 'research') {
      const researchPayload: Record<string, unknown> = {
        query: clampText(
          getString(payload.query) ?? getString(payload.topic) ?? extractResearchQuery(text),
          MAX_DESCRIPTION_CHARS,
        ),
        utterance: text,
        requestedAt,
      };
      const threadId = getString(payload.threadId);
      if (threadId) {
        researchPayload.threadId = threadId;
      }
      return researchPayload;
    }
    if (intent === 'note') {
      const content = clampText(
        getString(payload.content) ?? getString(payload.note) ?? extractNoteContent(text),
        MAX_NOTE_CONTENT_CHARS,
      );
      const tags =
        getStringArray(payload.tags)?.map((entry) => clampText(entry, MAX_NOTE_TAG_CHARS)) ?? [];
      return {
        title: clampText(
          getString(payload.title) ?? deriveNoteTitle(content),
          MAX_NOTE_TITLE_CHARS,
        ),
        content,
        tags: tags.slice(0, MAX_NOTE_TAGS),
        utterance: text,
        requestedAt,
      };
    }
    if (intent === 'note_search') {
      const query = clampText(
        getString(payload.query) ?? extractNoteSearchQuery(text),
        MAX_NOTE_CONTENT_CHARS,
      );
      const sinceDaysFromPayload =
        typeof payload.sinceDays === 'number' && Number.isFinite(payload.sinceDays)
          ? Math.max(1, Math.trunc(payload.sinceDays))
          : null;
      return {
        query,
        sinceDays: sinceDaysFromPayload ?? extractSinceDaysFromText(text) ?? 30,
        limit: 3,
        utterance: text,
        requestedAt,
      };
    }
    if (intent === 'briefing') {
      return {
        requestedAt,
        utterance: text,
        timeframe: clampText(getString(payload.timeframe) ?? 'today', 40),
      };
    }
    return {
      topic: clampText(getString(payload.topic) ?? getString(payload.query) ?? 'top', 80),
      query: clampText(getString(payload.query) ?? text, MAX_DESCRIPTION_CHARS),
      utterance: text,
      requestedAt,
    };
  }

  private async handleCalendarIntent(
    text: string,
    payload: Record<string, unknown>,
  ): Promise<IntentOutcome> {
    const now = this.now();
    const start = parseDateTime(payload.start) ?? new Date(now.getTime() + 60 * 60 * 1000);
    const requestedEnd = parseDateTime(payload.end);
    const end =
      requestedEnd && requestedEnd.getTime() > start.getTime()
        ? requestedEnd
        : new Date(start.getTime() + 60 * 60 * 1000);
    const title =
      clampText(
        getString(payload.title) ?? getString(payload.name) ?? sentenceCase(text),
        MAX_CALENDAR_TITLE_CHARS,
      ) || 'Calendar event';
    const calendarPayload: Record<string, unknown> = {
      id: getString(payload.id) ?? randomUUID(),
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      status: normalizeCalendarStatus(payload.status),
      requestedAt: now.toISOString(),
      utterance: text,
    };
    const attendees = getStringArray(payload.attendees)?.map((item) =>
      clampText(item, MAX_ATTENDEE_CHARS),
    );
    if (attendees) {
      calendarPayload.attendees = attendees;
    }
    const location = getString(payload.location);
    if (location) {
      calendarPayload.location = clampText(location, MAX_LOCATION_CHARS);
    }

    await this.publishSafe(Topics.lifeos.voiceIntentCalendarAdd, calendarPayload);
    await this.publishSafe(Topics.agent.workRequested, {
      utterance: text,
      intent: 'calendar',
      payload: calendarPayload,
      requestedAt: now.toISOString(),
      origin: 'voice-core',
    });
    const responseText = `Added "${title}" to your calendar.`;
    await this.publishSafe(Topics.lifeos.voiceCommandProcessed, {
      action: 'agent_work_requested',
      text,
      responseText,
      intent: 'calendar',
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

  private async handleTaskIntent(
    text: string,
    taskTitle: string,
    dueDate?: string | null,
  ): Promise<IntentOutcome> {
    const createdAt = this.now().toISOString();
    const planId = `goal_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const planTitle = `Voice task: ${clampText(taskTitle, MAX_TASK_TITLE_CHARS) || 'Untitled task'}`;
    const trimmedCommand = clampText(text, MAX_DESCRIPTION_CHARS);

    const task: Record<string, unknown> = {
      id: taskId,
      title: clampText(taskTitle, MAX_TASK_TITLE_CHARS) || 'Untitled task',
      status: 'todo',
      priority: 4,
      voiceTriggered: true,
    };
    if (dueDate) {
      task.dueDate = dueDate;
    }

    await this.client.createNode('plan', {
      id: planId,
      createdAt,
      title: planTitle,
      description: `Created from voice command: "${trimmedCommand}"`,
      tasks: [task],
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
    await this.publishSafe(Topics.lifeos.voiceIntentTaskAdd, {
      utterance: text,
      taskTitle,
      planId,
      taskId,
      requestedAt: createdAt,
      ...(dueDate ? { dueDate } : {}),
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
