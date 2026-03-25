import type { RawMessage, SummarizedMessage } from './events';

export type SummarizerFetch = typeof fetch;

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1:8b';
const MAX_BODY_CHARS_PER_MESSAGE = 3000;
const MAX_BATCH = 5;
const FALLBACK_SUMMARY_CHARS = 120;
const MAX_MODEL_CHARS = 120;
const MAX_SUMMARY_CHARS = 400;
const REQUEST_TIMEOUT_MS = 20_000;

interface OllamaResponse {
  message?: {
    content?: unknown;
  };
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeText(value: string, maxChars: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function resolveEndpoint(env: NodeJS.ProcessEnv): string {
  const rawHost = env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST;
  try {
    const parsed = new URL(rawHost);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.toString().replace(/\/+$/, '')}/api/chat`;
  } catch {
    return `${DEFAULT_OLLAMA_HOST}/api/chat`;
  }
}

function resolveModel(env: NodeJS.ProcessEnv): string {
  const preferred =
    env.LIFEOS_EMAIL_MODEL?.trim() || env.LIFEOS_VOICE_MODEL?.trim() || DEFAULT_MODEL;
  const safe = sanitizeText(preferred, MAX_MODEL_CHARS);
  return safe.length > 0 ? safe : DEFAULT_MODEL;
}

async function fetchWithTimeout(
  fetchFn: SummarizerFetch,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchFn(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('summarizer request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(messages: RawMessage[]): string {
  const lines = messages.map((message, index) => {
    const body = sanitizeText(message.body, MAX_BODY_CHARS_PER_MESSAGE);
    const subject = sanitizeText(message.subject, 200);
    const from = sanitizeText(message.from, 200);
    const messageId = sanitizeText(message.messageId, 260);
    return [
      `Email ${index + 1}`,
      `Subject: ${subject}`,
      `From: ${from}`,
      `MessageId: ${messageId}`,
      `Body: ${body}`,
    ].join('\n');
  });
  return `${lines.join('\n\n')}\n\nRespond as JSON array where each item has: messageId, summary.`;
}

function fallback(messages: RawMessage[]): SummarizedMessage[] {
  return messages.map((message) => ({
    subject: message.subject,
    from: message.from,
    messageId: message.messageId,
    receivedAt: message.receivedAt,
    summary: sanitizeText(message.body, FALLBACK_SUMMARY_CHARS),
    accountLabel: message.accountLabel,
    read: false,
  }));
}

function parseSummaries(messages: RawMessage[], content: string): SummarizedMessage[] | null {
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) {
    return null;
  }

  const byId = new Map<string, string>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const messageId = getString(row.messageId);
    const summaryRaw = getString(row.summary);
    const summary = summaryRaw ? sanitizeText(summaryRaw, MAX_SUMMARY_CHARS) : null;
    if (messageId && summary) {
      byId.set(messageId, summary);
    }
  }

  return messages.map((message) => ({
    subject: message.subject,
    from: message.from,
    messageId: message.messageId,
    receivedAt: message.receivedAt,
    summary: byId.get(message.messageId) || sanitizeText(message.body, FALLBACK_SUMMARY_CHARS),
    accountLabel: message.accountLabel,
    read: false,
  }));
}

export async function summarizeMessages(
  messages: RawMessage[],
  env: NodeJS.ProcessEnv,
  fetchFn: SummarizerFetch,
): Promise<SummarizedMessage[]> {
  if (messages.length === 0) {
    return [];
  }

  const model = resolveModel(env);
  const endpoint = resolveEndpoint(env);

  const all: SummarizedMessage[] = [];
  for (let index = 0; index < messages.length; index += MAX_BATCH) {
    const batch = messages.slice(index, index + MAX_BATCH);
    try {
      const response = await fetchWithTimeout(fetchFn, endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                'You are a concise email assistant. Summarize each email in one sentence. Output JSON array.',
            },
            {
              role: 'user',
              content: buildPrompt(batch),
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`summarizer request failed (${response.status})`);
      }
      const data = (await response.json()) as OllamaResponse;
      const content = getString(data.message?.content);
      if (!content) {
        throw new Error('summarizer returned empty content');
      }
      const parsed = parseSummaries(batch, content);
      if (!parsed) {
        throw new Error('summarizer returned non-JSON array');
      }
      all.push(...parsed);
    } catch {
      all.push(...fallback(batch));
    }
  }

  return all;
}
