import { Topics, type BaseEvent } from '@lifeos/event-bus';
import {
  MemoryManager,
  type LifeGraphClient,
  type LifeGraphMemoryType,
  type LifeGraphUpdate,
} from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';
import { Personality, type PersonalityProfile } from '@lifeos/personality';
import { TextToSpeech } from '@lifeos/voice-core';

interface SpeechOutput {
  speak(text: string): Promise<void>;
}

export interface OrchestratorDecision {
  action: 'speak' | 'update' | 'nothing';
  message?: string;
  updates?: LifeGraphUpdate[];
}

export interface OrchestratorDecisionInput {
  event: BaseEvent<Record<string, unknown>>;
  context: string[];
}

type DecisionEngine = (
  input: OrchestratorDecisionInput,
  profile: PersonalityProfile,
  runtimeContext: ModuleRuntimeContext,
  client: LifeGraphClient,
) => Promise<OrchestratorDecision>;

interface PersonalityProvider {
  loadProfile(): Promise<PersonalityProfile>;
  updatePreference?(key: string, value: unknown): Promise<unknown>;
}

export interface OrchestratorModuleOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
  tts?: SpeechOutput;
  decisionEngine?: DecisionEngine;
  personality?: PersonalityProvider;
}

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_CONTEXT_ITEMS = 6;
const MAX_PROACTIVE_MESSAGE_CHARS = 320;
const MAX_DECISION_UPDATES = 24;
const SUGGESTION_DEDUP_WINDOW_MS = 90_000;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_BRIEFING_MAX_CHARS = 900;
const SHORT_BRIEFING_MAX_CHARS = 520;
const BRIEFING_MIN_CHARS = 180;
const BRIEFING_MAX_CHARS = 1300;
const BRIEFING_CHARS_PER_SECOND = 11;
const CONTEXT_SPIKE_CALENDAR_WINDOW_MS = 48 * 60 * 60 * 1000;

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeSerialize(value: unknown, maxChars = 4000): string {
  try {
    return JSON.stringify(value).slice(0, maxChars);
  } catch {
    return '"[unserializable]"';
  }
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseTimestampMs(value: string | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseBooleanPreference(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on' ||
    normalized === 'enabled'
  );
}

function resolveBriefingMaxChars(profile: PersonalityProfile, shortBriefing: boolean): number {
  const preferenceSeconds = parsePositiveInt(profile.preferences.briefing_max_seconds);
  if (preferenceSeconds) {
    const preferredChars = preferenceSeconds * BRIEFING_CHARS_PER_SECOND;
    return Math.max(BRIEFING_MIN_CHARS, Math.min(BRIEFING_MAX_CHARS, preferredChars));
  }
  return shortBriefing ? SHORT_BRIEFING_MAX_CHARS : DEFAULT_BRIEFING_MAX_CHARS;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function hasTokenOverlap(left: string, right: string): boolean {
  const leftTokens = new Set(tokenize(left));
  for (const token of tokenize(right)) {
    if (leftTokens.has(token)) {
      return true;
    }
  }
  return false;
}

function buildOrchestratorPromptWithProfile(
  input: OrchestratorDecisionInput,
  profile: PersonalityProfile,
): string {
  const payload = safeSerialize(
    {
      profile,
      event: {
        type: input.event.type,
        source: input.event.source,
        data: input.event.data,
      },
      context: input.context,
    },
    6000,
  );
  return `You are the LifeOS Orchestrator, a calm and welcoming guide.
You must respect user preferences and communication style.
Be practical, encouraging, and non-judgmental.
Respond strictly as JSON:
{
  "action": "speak" | "update" | "nothing",
  "message": "optional concise sentence",
  "updates": []
}
If there is no high-value action, choose "nothing".
Keep suggestions concise when profile.communicationStyle asks for short responses.
When action is "speak", the message should be kind, specific, and useful.

Input:
${payload}`;
}

function parseDecision(raw: string): OrchestratorDecision {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    return { action: 'nothing' };
  }
  const candidate = parsed as {
    action?: unknown;
    message?: unknown;
    updates?: unknown;
  };
  const action =
    candidate.action === 'speak' || candidate.action === 'update' || candidate.action === 'nothing'
      ? candidate.action
      : 'nothing';
  const message = getString(candidate.message) ?? undefined;
  const updates = Array.isArray(candidate.updates)
    ? (candidate.updates as LifeGraphUpdate[])
    : undefined;
  return {
    action,
    ...(message ? { message } : {}),
    ...(updates ? { updates } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSupportedUpdate(value: unknown): value is LifeGraphUpdate {
  if (!isRecord(value)) {
    return false;
  }
  if (value.op !== 'append_memory') {
    return false;
  }
  return isRecord(value.entry);
}

function normalizeDecision(decision: OrchestratorDecision): OrchestratorDecision {
  const action =
    decision.action === 'speak' || decision.action === 'update' || decision.action === 'nothing'
      ? decision.action
      : 'nothing';
  const message = getString(decision.message)?.slice(0, MAX_PROACTIVE_MESSAGE_CHARS);
  const updates = Array.isArray(decision.updates)
    ? decision.updates.filter((update) => isSupportedUpdate(update)).slice(0, MAX_DECISION_UPDATES)
    : undefined;

  if (action === 'update' && (!updates || updates.length === 0)) {
    return { action: 'nothing' };
  }
  if (action === 'speak' && !message) {
    return { action: 'nothing' };
  }

  return {
    action,
    ...(message ? { message } : {}),
    ...(updates ? { updates } : {}),
  };
}

async function speakSafe(
  tts: SpeechOutput,
  message: string,
  context: ModuleRuntimeContext,
): Promise<void> {
  const text = message.trim();
  if (!text) {
    return;
  }
  try {
    await tts.speak(text);
  } catch (error: unknown) {
    context.log(`[Orchestrator] TTS degraded: ${normalizeErrorMessage(error)}`);
  }
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'orchestrator');
  } catch (error: unknown) {
    context.log(`[Orchestrator] publish degraded (${topic}): ${normalizeErrorMessage(error)}`);
  }
}

async function buildBriefing(
  client: LifeGraphClient,
  now: Date,
  profile: PersonalityProfile,
  memory: MemoryManager,
): Promise<{ summary: string; memoryRelated: string[] }> {
  const graph = await client.loadGraph();
  const nowMs = now.getTime();
  const dayAheadMs = nowMs + 24 * 60 * 60 * 1000;

  const openTasks = graph.plans
    .flatMap((plan) => plan.tasks)
    .filter((task) => task.status !== 'done');
  const nextTask = [...openTasks].sort(
    (left, right) =>
      new Date(left.dueDate ?? '2999-12-31').getTime() -
      new Date(right.dueDate ?? '2999-12-31').getTime(),
  )[0];
  const upcomingEvents = (graph.calendarEvents ?? [])
    .filter((event) => {
      const startMs = Date.parse(event.start);
      return Number.isFinite(startMs) && startMs >= nowMs && startMs <= dayAheadMs;
    })
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const latestWeather = await client.getLatestWeatherSnapshot();
  const latestNews = await client.getLatestNewsDigest();
  const latestResearch = [...(graph.researchResults ?? [])].sort(
    (left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt),
  )[0];
  const emailDigestCount = graph.emailDigests?.length ?? 0;

  const shortBriefing =
    profile.communicationStyle.toLowerCase().includes('concise') ||
    profile.quirks.some((quirk) => quirk.toLowerCase().includes('long briefing'));
  const lines: string[] = ['Good morning. Here is what matters today.'];
  if (profile.priorities.length > 0) {
    lines.push(`Priorities today: ${profile.priorities.slice(0, 3).join(', ')}.`);
  }
  if (!nextTask) {
    lines.push('No open tasks need immediate action.');
  } else {
    lines.push(
      `Top task: ${nextTask.title}${nextTask.dueDate ? `, due ${nextTask.dueDate}` : ''}.`,
    );
  }
  if ((upcomingEvents ?? []).length > 0) {
    const nextEvent = upcomingEvents[0];
    if (nextEvent) {
      lines.push(`Next calendar event: ${nextEvent.title} at ${nextEvent.start}.`);
    }
  } else {
    lines.push('No calendar events in the next 24 hours.');
  }
  if (emailDigestCount > 0) {
    lines.push(
      `Inbox summary: ${emailDigestCount} email digest${emailDigestCount === 1 ? '' : 's'} ready.`,
    );
  }
  if (latestWeather?.forecast) {
    lines.push(`Weather: ${latestWeather.forecast}`);
  }
  if (latestNews?.summary) {
    lines.push(`News: ${latestNews.summary}`);
  }
  if (latestResearch?.summary) {
    lines.push(`Recent research: ${latestResearch.summary}`);
  }
  const recentMemory = await memory.getRelevantContextForToday(2);
  const memoryHighlight = recentMemory[0]?.replace(/\s*@[0-9TZ:.\-+]+$/, '');
  if (memoryHighlight) {
    lines.push(`Memory highlight: ${memoryHighlight}.`);
  }

  const selectedLines = shortBriefing ? lines.slice(0, 5) : lines;
  const maxChars = resolveBriefingMaxChars(profile, shortBriefing);

  return {
    summary: selectedLines.join(' ').slice(0, maxChars),
    memoryRelated: [
      ...(nextTask ? [nextTask.id] : []),
      ...upcomingEvents.map((event) => event.id),
      ...(latestResearch ? [latestResearch.id] : []),
    ],
  };
}

async function buildContextSpikeSuggestion(
  event: BaseEvent<Record<string, unknown>>,
  client: LifeGraphClient,
  referenceNow: Date,
): Promise<string | null> {
  if (event.type !== Topics.lifeos.researchCompleted) {
    return null;
  }

  const query = getString(event.data.query);
  if (!query) {
    return null;
  }

  const graph = await client.loadGraph();
  const nowMs = referenceNow.getTime();
  const withinWindowMs = nowMs + CONTEXT_SPIKE_CALENDAR_WINDOW_MS;
  const match = (graph.calendarEvents ?? []).find((calendarEvent) => {
    const startMs = parseTimestampMs(calendarEvent.start);
    if (!Number.isFinite(startMs) || startMs < nowMs || startMs > withinWindowMs) {
      return false;
    }
    return hasTokenOverlap(calendarEvent.title, query);
  });
  if (!match) {
    return null;
  }

  return `Context spike: your research on ${query} matches "${match.title}". Should I add prep notes now?`;
}

async function heuristicDecision(
  input: OrchestratorDecisionInput,
  client: LifeGraphClient,
  referenceNow: Date,
): Promise<OrchestratorDecision> {
  if (input.event.type === Topics.lifeos.researchCompleted) {
    const eventData = input.event.data;
    const query = getString(eventData.query) ?? '';
    if (query) {
      const graph = await client.loadGraph();
      const nowMs = referenceNow.getTime();
      const within48h = nowMs + 48 * 60 * 60 * 1000;
      const match = (graph.calendarEvents ?? []).find((event) => {
        const startMs = Date.parse(event.start);
        if (!Number.isFinite(startMs) || startMs < nowMs || startMs > within48h) {
          return false;
        }
        return hasTokenOverlap(event.title, query);
      });
      if (match) {
        return {
          action: 'speak',
          message: `Your research on ${query} may help with "${match.title}". Want me to add prep notes?`,
        };
      }
    }
  }

  if (input.event.type === Topics.lifeos.weatherSnapshotCaptured) {
    const forecast = getString(input.event.data.forecast)?.toLowerCase() ?? '';
    if (forecast.includes('rain')) {
      return {
        action: 'speak',
        message: 'Rain is expected soon. Want me to help reschedule outdoor tasks?',
      };
    }
  }

  if (input.event.type === Topics.lifeos.noteAdded) {
    const noteTitle = getString(input.event.data.title);
    if (!noteTitle) {
      return { action: 'nothing' };
    }

    const graph = await client.loadGraph();
    const openTasks = graph.plans.flatMap((plan) =>
      plan.tasks
        .filter((task) => task.status !== 'done')
        .map((task) => ({
          id: task.id,
          title: task.title,
        })),
    );
    const matchingTask = openTasks.find((task) => hasTokenOverlap(task.title, noteTitle));
    if (matchingTask) {
      return {
        action: 'speak',
        message: `Your new note "${noteTitle}" may affect "${matchingTask.title}". Want me to update that task?`,
      };
    }
  }

  return { action: 'nothing' };
}

function createDecisionEngine(fetchFn: typeof fetch): DecisionEngine {
  return async (input, profile, runtimeContext, client) => {
    const model =
      runtimeContext.env.LIFEOS_ORCHESTRATOR_MODEL?.trim() ||
      runtimeContext.env.LIFEOS_VOICE_MODEL?.trim() ||
      runtimeContext.env.LIFEOS_GOAL_MODEL?.trim() ||
      'llama3.1:8b';
    const host = runtimeContext.env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434';
    const endpoint = `${host.replace(/\/+$/, '')}/api/chat`;
    const timeoutMs =
      Number.parseInt(runtimeContext.env.LIFEOS_ORCHESTRATOR_TIMEOUT_MS ?? '', 10) ||
      DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.2,
            num_ctx: 4096,
          },
          messages: [
            {
              role: 'system',
              content:
                'You are LifeOS Orchestrator. Respect personality preferences and keep proactive suggestions practical.',
            },
            {
              role: 'user',
              content: buildOrchestratorPromptWithProfile(input, profile),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`orchestrator request failed (${response.status})`);
      }
      const payload = (await response.json()) as { message?: { content?: unknown } };
      const content = payload.message?.content;
      if (typeof content !== 'string') {
        throw new Error('orchestrator response content missing');
      }
      return parseDecision(content);
    } catch {
      return heuristicDecision(input, client, new Date());
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createOrchestratorModule(options: OrchestratorModuleOptions = {}): LifeOSModule {
  const now = options.now ?? (() => new Date());
  const tts = options.tts ?? new TextToSpeech();
  const fetchFn = options.fetchFn ?? fetch;
  const decide = options.decisionEngine ?? createDecisionEngine(fetchFn);
  let lastAutoBriefingDate: string | null = null;
  let lastSuggestion: { message: string; atMs: number } | null = null;

  return {
    id: 'orchestrator',
    async init(context: ModuleRuntimeContext): Promise<void> {
      const client = context.createLifeGraphClient(
        context.graphPath
          ? {
              graphPath: context.graphPath,
              env: context.env,
            }
          : {
              env: context.env,
            },
      );
      const memory = new MemoryManager({ client, now });
      const personality =
        options.personality ??
        new Personality({
          client,
          now,
        });
      let profileCache: {
        value: PersonalityProfile;
        expiresAtMs: number;
      } | null = null;
      const fallbackProfile: PersonalityProfile = {
        communicationStyle: 'concise and direct',
        priorities: ['health', 'deep work', 'family'],
        quirks: ['hates long briefings', 'loves research rabbit holes'],
        preferences: {},
      };

      async function getProfile(): Promise<PersonalityProfile> {
        const nowMs = now().getTime();
        if (profileCache && profileCache.expiresAtMs > nowMs) {
          return profileCache.value;
        }
        try {
          const loaded = await personality.loadProfile();
          profileCache = {
            value: loaded,
            expiresAtMs: nowMs + PROFILE_CACHE_TTL_MS,
          };
          return loaded;
        } catch (error: unknown) {
          context.log(`[Orchestrator] profile degraded: ${normalizeErrorMessage(error)}`);
          return profileCache?.value ?? fallbackProfile;
        }
      }

      async function emitSuggestion(
        message: string,
        eventType: string,
        eventAt: Date,
        source: 'context_spike' | 'decision',
      ): Promise<boolean> {
        const nowMs = eventAt.getTime();
        if (
          lastSuggestion &&
          lastSuggestion.message === message &&
          nowMs - lastSuggestion.atMs < SUGGESTION_DEDUP_WINDOW_MS
        ) {
          context.log('[Orchestrator] duplicate suggestion suppressed.');
          return false;
        }
        lastSuggestion = { message, atMs: nowMs };

        await speakSafe(tts, message, context);
        await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
          message,
          eventType,
          at: eventAt.toISOString(),
          source,
        });
        await memory.remember({
          type: 'insight',
          content: `Suggestion (${source}): ${message}`,
          relatedTo: [eventType],
        });
        return true;
      }

      async function handleSyncDelta(event: BaseEvent<Record<string, unknown>>): Promise<void> {
        context.log('📡 Received sync from another device');

        let contextSnippets: string[] = [];
        try {
          contextSnippets = await memory.getRelevantContextForCurrentConversation(
            `sync_received ${safeSerialize(event.data, 2000)}`,
            {
              limit: MAX_CONTEXT_ITEMS,
              sinceDays: 7,
              minScore: 0.1,
            },
          );
        } catch (error: unknown) {
          context.log(`[Orchestrator] sync context degraded: ${normalizeErrorMessage(error)}`);
        }

        const profile = await getProfile();
        const decision = normalizeDecision(
          await decide(
            {
              event: {
                ...event,
                type: 'sync_received',
                data: {
                  delta: event.data,
                  receivedAt: now().toISOString(),
                },
              },
              context: contextSnippets,
            },
            profile,
            context,
            client,
          ),
        );

        if (decision.action === 'update' && decision.updates && decision.updates.length > 0) {
          try {
            await client.applyUpdates(decision.updates);
          } catch (error: unknown) {
            context.log(`[Orchestrator] sync update degraded: ${normalizeErrorMessage(error)}`);
          }
        }

        if (decision.action === 'speak' && getString(decision.message)) {
          await emitSuggestion(String(decision.message), event.type, now(), 'decision');
        }
      }

      await context.subscribe<Record<string, unknown>>(Topics.lifeos.syncDelta, async (event) => {
        await handleSyncDelta(event as BaseEvent<Record<string, unknown>>);
      });

      await context.subscribe<Record<string, unknown>>('lifeos.>', async (event) => {
        if (event.type === Topics.lifeos.syncDelta) {
          return;
        }

        if (event.type === Topics.lifeos.syncConflictDetected) {
          const countFromData =
            typeof event.data.conflictCount === 'number' &&
            Number.isFinite(event.data.conflictCount)
              ? Math.max(0, Math.trunc(event.data.conflictCount))
              : Array.isArray(event.data.conflicts)
                ? event.data.conflicts.length
                : 0;
          try {
            await memory.remember({
              type: 'insight',
              content: `Sync conflict audit: ${countFromData} conflicts from ${event.data.deviceId ?? 'unknown-device'}.`,
              relatedTo: [event.type],
            });
          } catch (error: unknown) {
            context.log(
              `[Orchestrator] sync conflict memory degraded: ${normalizeErrorMessage(error)}`,
            );
          }

          if (countFromData <= 0) {
            return;
          }
          const profile = await getProfile();
          const speakConflicts = parseBooleanPreference(
            profile.preferences.sync_conflict_voice_alerts,
          );
          if (!speakConflicts) {
            return;
          }
          const message =
            countFromData === 1
              ? 'Sync conflict detected on one item. I kept the newest version.'
              : `Sync conflict detected on ${countFromData} items. I kept the newest versions.`;
          await emitSuggestion(message, event.type, now(), 'decision');
          return;
        }

        if (event.type === Topics.lifeos.voiceIntentPreferenceSet) {
          const key = getString(event.data.key);
          const value = getString(event.data.value);
          if (!key || !value) {
            context.log('[Orchestrator] preference update ignored: missing key/value');
            return;
          }
          try {
            await personality.updatePreference?.(key, value);
            profileCache = null;
            await publishSafe(context, Topics.lifeos.personalityUpdated, {
              key,
              value,
              updatedAt: now().toISOString(),
            });
          } catch (error: unknown) {
            context.log(
              `[Orchestrator] preference update degraded: ${normalizeErrorMessage(error)}`,
            );
          }
          return;
        }

        if (event.type === Topics.lifeos.voiceIntentBriefing) {
          try {
            const profile = await getProfile();
            const briefing = await buildBriefing(client, now(), profile, memory);
            await speakSafe(tts, briefing.summary, context);
            await publishSafe(context, Topics.lifeos.briefingGenerated, {
              summary: briefing.summary,
              generatedAt: now().toISOString(),
              source: 'orchestrator',
            });
            await memory.remember({
              type: 'insight',
              content: `Daily briefing delivered: ${briefing.summary}`,
              relatedTo: briefing.memoryRelated,
            });
          } catch (error: unknown) {
            context.log(`[Orchestrator] briefing degraded: ${normalizeErrorMessage(error)}`);
          }
          return;
        }

        if (event.source === 'orchestrator') {
          return;
        }

        const eventNow = now();

        if (event.type === Topics.lifeos.voiceWakeDetected) {
          const today = toDateKey(eventNow);
          if (lastAutoBriefingDate !== today) {
            lastAutoBriefingDate = today;
            await publishSafe(context, Topics.lifeos.voiceIntentBriefing, {
              requestedAt: eventNow.toISOString(),
              reason: 'first_wake_after_midnight',
            });
          }
        }

        const memoryType: LifeGraphMemoryType = event.type.includes('voice')
          ? 'conversation'
          : event.type.includes('research')
            ? 'research'
            : event.type.includes('note')
              ? 'note'
              : 'insight';

        try {
          await memory.remember({
            type: memoryType,
            content: `${event.type} ${safeSerialize(event.data, 2000)}`,
            relatedTo: [event.type],
          });
        } catch (error: unknown) {
          context.log(`[Orchestrator] memory degraded: ${normalizeErrorMessage(error)}`);
        }

        try {
          const spikeSuggestion = await buildContextSpikeSuggestion(
            event as BaseEvent<Record<string, unknown>>,
            client,
            eventNow,
          );
          if (spikeSuggestion) {
            const emitted = await emitSuggestion(
              spikeSuggestion,
              event.type,
              eventNow,
              'context_spike',
            );
            if (emitted) {
              return;
            }
          }
        } catch (error: unknown) {
          context.log(`[Orchestrator] context spike degraded: ${normalizeErrorMessage(error)}`);
        }

        let contextSnippets: string[] = [];
        try {
          contextSnippets = await memory.getRelevantContextForCurrentConversation(
            `${event.type} ${safeSerialize(event.data, 3000)}`,
            {
              limit: MAX_CONTEXT_ITEMS,
              sinceDays: 7,
              minScore: 0.1,
            },
          );
        } catch (error: unknown) {
          context.log(`[Orchestrator] context lookup degraded: ${normalizeErrorMessage(error)}`);
        }

        const profile = await getProfile();
        const decision = normalizeDecision(
          await decide(
            {
              event: event as BaseEvent<Record<string, unknown>>,
              context: contextSnippets,
            },
            profile,
            context,
            client,
          ),
        );

        if (decision.action === 'update' && decision.updates && decision.updates.length > 0) {
          try {
            await client.applyUpdates(decision.updates);
          } catch (error: unknown) {
            context.log(`[Orchestrator] update apply degraded: ${normalizeErrorMessage(error)}`);
          }
        }

        if (decision.action === 'speak' && getString(decision.message)) {
          const message = String(decision.message);
          await emitSuggestion(message, event.type, eventNow, 'decision');
        }
      });
    },
  };
}

export const orchestratorModule = createOrchestratorModule();
