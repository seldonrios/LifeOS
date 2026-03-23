import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

interface VoiceNotePayload {
  title?: unknown;
  content?: unknown;
  note?: unknown;
  text?: unknown;
  utterance?: unknown;
  tags?: unknown;
}

interface AgentWorkPayload {
  intent?: unknown;
  utterance?: unknown;
  payload?: unknown;
}

const MAX_TITLE_CHARS = 200;
const MAX_CONTENT_CHARS = 8000;
const MAX_TAGS = 20;
const MAX_TAG_CHARS = 40;

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
  await context.publish(
    Topics.lifeos.noteAdded,
    {
      id: saved.id,
      title: saved.title,
      createdAt: saved.createdAt,
      tags: saved.tags,
    },
    'notes-module',
  );
  context.log(`[Notes] Saved note "${saved.title}"`);
}

export function createNotesModule(): LifeOSModule {
  return {
    id: 'notes',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentNoteAdd,
        async (event) => {
          try {
            await persistNote(toVoicePayload(event), context);
          } catch (error: unknown) {
            context.log(`[Notes] voice intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<AgentWorkPayload>(Topics.agent.workRequested, async (event) => {
        const payload = toAgentPayload(event);
        if (!payload) {
          return;
        }
        try {
          await persistNote(payload, context);
        } catch (error: unknown) {
          context.log(`[Notes] agent work degraded: ${normalizeErrorMessage(error)}`);
        }
      });
    },
  };
}

export const notesModule = createNotesModule();
