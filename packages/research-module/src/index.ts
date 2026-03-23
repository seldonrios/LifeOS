import { randomUUID } from 'node:crypto';

import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';
import { TextToSpeech } from '@lifeos/voice-core';

interface VoiceResearchPayload {
  query?: unknown;
  utterance?: unknown;
  threadId?: unknown;
}

interface AgentWorkPayload {
  intent?: unknown;
  utterance?: unknown;
  payload?: unknown;
}

interface OllamaChatResponse {
  message?: {
    content?: unknown;
  };
}

interface SpeechOutput {
  speak(text: string): Promise<void>;
}

export interface ResearchModuleOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
  tts?: SpeechOutput;
}

const MAX_QUERY_CHARS = 400;
const MAX_SUMMARY_CHARS = 4000;
const MAX_CONTEXT_ITEMS = 8;
const FOLLOW_UP_PATTERN =
  /^(tell me more|expand(?: on)?|go deeper|more details|continue|what else)\b/i;
const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_RESEARCH_MODEL = 'llama3.1:8b';
const DEFAULT_TIMEOUT_MS = 12_000;

function createClient(context: ModuleRuntimeContext): LifeGraphClient {
  return context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function cleanQuery(raw: string): string {
  const stripped = raw.replace(
    /^(hey life(?:\s?os)?[,\s]*)?(research|look up|investigate|find information on)\s+/i,
    '',
  );
  const normalized = clampText(stripped || raw, MAX_QUERY_CHARS);
  return normalized || 'general topic';
}

function resolveResearchQuery(payload: VoiceResearchPayload): string | null {
  const direct = getString(payload.query);
  if (direct) {
    return cleanQuery(direct);
  }
  const utterance = getString(payload.utterance);
  if (utterance) {
    return cleanQuery(utterance);
  }
  return null;
}

function resolveTimeoutMs(context: ModuleRuntimeContext): number {
  const raw = context.env.LIFEOS_RESEARCH_TIMEOUT_MS;
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

function isFollowUpQuery(query: string): boolean {
  return FOLLOW_UP_PATTERN.test(query.trim().toLowerCase());
}

function normalizeThreadId(value: unknown): string | null {
  const threadId = getString(value);
  if (!threadId) {
    return null;
  }
  return threadId;
}

async function summarizeResearchWithPrompt(
  prompt: string,
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
): Promise<{ summary: string; source: string }> {
  const model =
    context.env.LIFEOS_RESEARCH_MODEL?.trim() ||
    context.env.LIFEOS_VOICE_MODEL?.trim() ||
    context.env.LIFEOS_GOAL_MODEL?.trim() ||
    DEFAULT_RESEARCH_MODEL;
  const host = context.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST;
  const endpoint = `${host.replace(/\/+$/, '')}/api/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs(context));

  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          temperature: 0.2,
          num_ctx: 8192,
        },
        messages: [
          {
            role: 'system',
            content:
              'You are a practical research assistant. Provide concise, useful answers in 2-4 sentences.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama research request failed (${response.status})`);
    }

    const parsed = (await response.json()) as OllamaChatResponse;
    const content = getString(parsed.message?.content);
    if (!content) {
      throw new Error('Ollama research response missing content');
    }
    return {
      summary: clampText(content, MAX_SUMMARY_CHARS),
      source: `ollama:${model}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toResearchPrompt(query: string, previousSummary?: string): string {
  if (!previousSummary) {
    return `Research and give a concise 2-3 sentence summary: ${query}`;
  }
  return `Continue from previous research: ${previousSummary}\n\nNew question: ${query}`;
}

function buildConversationContext(
  previousContext: string[] | undefined,
  previousSummary: string | undefined,
  query: string,
): string[] {
  const nextContext = [...(previousContext ?? [])];
  if (previousSummary) {
    nextContext.push(`Previous summary: ${clampText(previousSummary, 300)}`);
  }
  nextContext.push(`User query: ${clampText(query, 200)}`);
  return nextContext.slice(-MAX_CONTEXT_ITEMS);
}

async function speakFeedback(
  tts: SpeechOutput,
  text: string,
  context: ModuleRuntimeContext,
): Promise<void> {
  try {
    await tts.speak(text);
  } catch (error: unknown) {
    context.log(`[Research] TTS degraded: ${normalizeErrorMessage(error)}`);
  }
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'research-module');
  } catch (error: unknown) {
    context.log(`[Research] publish degraded (${topic}): ${normalizeErrorMessage(error)}`);
  }
}

function toVoicePayload(event: BaseEvent<Record<string, unknown>>): VoiceResearchPayload {
  return {
    query: event.data.query,
    utterance: event.data.utterance,
    threadId: event.data.threadId,
  };
}

function toAgentPayload(event: BaseEvent<AgentWorkPayload>): VoiceResearchPayload | null {
  if (event.data.intent !== 'research') {
    return null;
  }
  const nested =
    event.data.payload &&
    typeof event.data.payload === 'object' &&
    !Array.isArray(event.data.payload)
      ? (event.data.payload as Record<string, unknown>)
      : {};
  return {
    query: nested.query ?? event.data.utterance,
    utterance: event.data.utterance,
    threadId: nested.threadId,
  };
}

export function createResearchModule(options: ResearchModuleOptions = {}): LifeOSModule {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => new Date());
  const tts = options.tts ?? new TextToSpeech();
  let latestThreadId: string | null = null;

  async function handleResearchPayload(
    payload: VoiceResearchPayload,
    context: ModuleRuntimeContext,
  ): Promise<void> {
    const query = resolveResearchQuery(payload);
    if (!query) {
      context.log('[Research] Ignored empty research query.');
      return;
    }

    const client = createClient(context);
    const nowIso = now().toISOString();
    const requestedThreadId =
      normalizeThreadId(payload.threadId) ?? (isFollowUpQuery(query) ? latestThreadId : null);
    let previous = null;
    if (requestedThreadId) {
      try {
        previous = await client.getResearchThread(requestedThreadId);
      } catch (error: unknown) {
        context.log(
          `[Research] thread lookup degraded (${requestedThreadId}): ${normalizeErrorMessage(error)}`,
        );
      }
    }
    const threadId = requestedThreadId ?? randomUUID();
    const prompt = toResearchPrompt(query, previous?.summary);

    let summary = '';
    let source = 'local-fallback';
    try {
      const generated = await summarizeResearchWithPrompt(prompt, context, fetchFn);
      summary = generated.summary;
      source = generated.source;
    } catch (error: unknown) {
      context.log(`[Research] summarizer degraded: ${normalizeErrorMessage(error)}`);
      summary = clampText(
        `Captured research topic "${query}". Local summarizer is unavailable right now.`,
        MAX_SUMMARY_CHARS,
      );
    }

    const saved = await client.saveResearchResult({
      threadId,
      query,
      summary,
      conversationContext: buildConversationContext(
        previous?.conversationContext,
        previous?.summary,
        query,
      ),
      sources: [source],
      savedAt: nowIso,
    });
    latestThreadId = saved.threadId;

    await publishSafe(context, Topics.lifeos.researchCompleted, {
      id: saved.id,
      threadId: saved.threadId,
      query: saved.query,
      summary: saved.summary,
      savedAt: saved.savedAt,
      sources: saved.sources ?? [source],
    });

    const preview = clampText(saved.summary, 120);
    await speakFeedback(
      tts,
      `Done. Research complete. ${preview}${preview.endsWith('.') ? '' : '.'} Want me to expand on any part?`,
      context,
    );
    context.log(`[Research] Saved summary for "${saved.query}"`);
  }

  return {
    id: 'research',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentResearch,
        async (event) => {
          try {
            await handleResearchPayload(toVoicePayload(event), context);
          } catch (error: unknown) {
            context.log(`[Research] voice intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<AgentWorkPayload>(Topics.agent.workRequested, async (event) => {
        const payload = toAgentPayload(event);
        if (!payload) {
          return;
        }
        try {
          await handleResearchPayload(payload, context);
        } catch (error: unknown) {
          context.log(`[Research] agent work degraded: ${normalizeErrorMessage(error)}`);
        }
      });
    },
  };
}

export const researchModule = createResearchModule();
