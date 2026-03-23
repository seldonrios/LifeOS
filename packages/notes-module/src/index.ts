import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';
import { TextToSpeech } from '@lifeos/voice-core';

interface VoiceNotePayload {
  title?: unknown;
  content?: unknown;
  note?: unknown;
  text?: unknown;
  utterance?: unknown;
  tags?: unknown;
}

interface VoiceNoteSearchPayload {
  query?: unknown;
  utterance?: unknown;
  sinceDays?: unknown;
  limit?: unknown;
}

interface AgentWorkPayload {
  intent?: unknown;
  utterance?: unknown;
  payload?: unknown;
}

interface SpeechOutput {
  speak(text: string): Promise<void>;
}

export interface NotesModuleOptions {
  tts?: SpeechOutput;
}

const MAX_TITLE_CHARS = 200;
const MAX_CONTENT_CHARS = 8000;
const MAX_TAGS = 20;
const MAX_TAG_CHARS = 40;
const MAX_SEARCH_LIMIT = 5;

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

function toTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => getString(entry))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => clampText(entry, MAX_TAG_CHARS))
    .slice(0, MAX_TAGS);
}

function deriveTitle(content: string): string {
  const title = content.split(/\s+/g).slice(0, 7).join(' ');
  return clampText(title || 'Voice note', MAX_TITLE_CHARS);
}

function cleanContent(raw: string): string {
  return clampText(
    raw.replace(/^(hey life(?:\s?os)?[,\s]*)?(note that|note)\s+/i, ''),
    MAX_CONTENT_CHARS,
  );
}

function resolveNotePayload(payload: VoiceNotePayload): {
  title: string;
  content: string;
  tags: string[];
} | null {
  const rawContent =
    getString(payload.content) ??
    getString(payload.note) ??
    getString(payload.text) ??
    getString(payload.utterance);
  if (!rawContent) {
    return null;
  }
  const content = cleanContent(rawContent);
  if (!content) {
    return null;
  }

  const title = clampText(getString(payload.title) ?? deriveTitle(content), MAX_TITLE_CHARS);
  return {
    title: title || 'Voice note',
    content,
    tags: toTags(payload.tags),
  };
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    return null;
  }
  return normalized;
}

function resolveSearchQuery(payload: VoiceNoteSearchPayload): string | null {
  const direct = getString(payload.query);
  if (direct) {
    return clampText(direct, 200);
  }
  const utterance = getString(payload.utterance);
  if (!utterance) {
    return null;
  }
  return clampText(
    utterance.replace(
      /^(hey life(?:\s?os)?[,\s]*)?(what did i note about|find notes? about)\s+/i,
      '',
    ),
    200,
  );
}

function resolveSinceDays(payload: VoiceNoteSearchPayload): number {
  const direct = parsePositiveInteger(payload.sinceDays);
  if (direct) {
    return direct;
  }
  const utterance = getString(payload.utterance)?.toLowerCase() ?? '';
  if (utterance.includes('last week')) {
    return 7;
  }
  if (utterance.includes('yesterday')) {
    return 1;
  }
  return 30;
}

function resolveSearchLimit(payload: VoiceNoteSearchPayload): number {
  const direct = parsePositiveInteger(payload.limit);
  if (!direct) {
    return 3;
  }
  return Math.min(direct, MAX_SEARCH_LIMIT);
}

async function speakFeedback(
  tts: SpeechOutput,
  text: string,
  context: ModuleRuntimeContext,
): Promise<void> {
  try {
    await tts.speak(text);
  } catch (error: unknown) {
    context.log(`[Notes] TTS degraded: ${normalizeErrorMessage(error)}`);
  }
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'notes-module');
  } catch (error: unknown) {
    context.log(`[Notes] publish degraded (${topic}): ${normalizeErrorMessage(error)}`);
  }
}

function toVoicePayload(event: BaseEvent<Record<string, unknown>>): VoiceNotePayload {
  return {
    title: event.data.title,
    content: event.data.content,
    note: event.data.note,
    text: event.data.text,
    utterance: event.data.utterance,
    tags: event.data.tags,
  };
}

function toSearchPayload(event: BaseEvent<Record<string, unknown>>): VoiceNoteSearchPayload {
  return {
    query: event.data.query,
    utterance: event.data.utterance,
    sinceDays: event.data.sinceDays,
    limit: event.data.limit,
  };
}

function toAgentPayload(event: BaseEvent<AgentWorkPayload>): VoiceNotePayload | null {
  if (event.data.intent !== 'note') {
    return null;
  }
  const nested =
    event.data.payload &&
    typeof event.data.payload === 'object' &&
    !Array.isArray(event.data.payload)
      ? (event.data.payload as Record<string, unknown>)
      : {};
  return {
    title: nested.title,
    content: nested.content ?? nested.note,
    note: nested.note,
    text: nested.text,
    utterance: getString(event.data.utterance),
    tags: nested.tags,
  };
}

async function persistNote(
  payload: VoiceNotePayload,
  context: ModuleRuntimeContext,
  tts: SpeechOutput,
): Promise<void> {
  const note = resolveNotePayload(payload);
  if (!note) {
    context.log('[Notes] Ignored empty note payload.');
    return;
  }
  const client = createClient(context);
  const saved = await client.appendNote({
    title: note.title,
    content: note.content,
    tags: note.tags,
    voiceTriggered: true,
  });
  await publishSafe(context, Topics.lifeos.noteAdded, {
    id: saved.id,
    title: saved.title,
    createdAt: saved.createdAt,
    tags: saved.tags,
  });
  const tagsLabel = saved.tags.length > 0 ? saved.tags.join(', ') : 'no tags';
  await speakFeedback(tts, `Done. Note saved under ${tagsLabel}.`, context);
  context.log(`[Notes] Saved note "${saved.title}"`);
}

async function searchNotes(
  payload: VoiceNoteSearchPayload,
  context: ModuleRuntimeContext,
  tts: SpeechOutput,
): Promise<void> {
  const query = resolveSearchQuery(payload);
  if (!query) {
    context.log('[Notes] Ignored empty note search query.');
    return;
  }

  const sinceDays = resolveSinceDays(payload);
  const limit = resolveSearchLimit(payload);
  const client = createClient(context);
  const results = await client.searchNotes(query, { sinceDays, limit });

  await publishSafe(context, Topics.lifeos.noteSearchCompleted, {
    query,
    sinceDays,
    count: results.length,
    noteIds: results.map((note) => note.id),
  });

  if (results.length === 0) {
    await speakFeedback(tts, `Done. I found no notes about ${query}.`, context);
    return;
  }

  const first = results[0];
  const preview = clampText(first?.content ?? first?.title ?? '', 120);
  await speakFeedback(
    tts,
    `Done. I found ${results.length} note${results.length === 1 ? '' : 's'} about ${query}. Latest: ${preview}.`,
    context,
  );
}

export function createNotesModule(options: NotesModuleOptions = {}): LifeOSModule {
  const tts = options.tts ?? new TextToSpeech();

  return {
    id: 'notes',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentNoteAdd,
        async (event) => {
          try {
            await persistNote(toVoicePayload(event), context, tts);
          } catch (error: unknown) {
            context.log(`[Notes] voice intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentNoteSearch,
        async (event) => {
          try {
            await searchNotes(toSearchPayload(event), context, tts);
          } catch (error: unknown) {
            context.log(`[Notes] search intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<AgentWorkPayload>(Topics.agent.workRequested, async (event) => {
        const payload = toAgentPayload(event);
        if (!payload) {
          return;
        }
        try {
          await persistNote(payload, context, tts);
        } catch (error: unknown) {
          context.log(`[Notes] agent work degraded: ${normalizeErrorMessage(error)}`);
        }
      });
    },
  };
}

export const notesModule = createNotesModule();
