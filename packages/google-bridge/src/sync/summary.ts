import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1:8b';
const DEFAULT_TIMEOUT_MS = 2500;
const MAX_INPUT_CHARS = 2000;
const MAX_SUMMARY_CHARS = 500;

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function normalizeBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function parseTimeoutMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(parsed, 20_000);
}

export async function summarizeForBusyUser(
  context: ModuleRuntimeContext,
  sourceText: string,
): Promise<string> {
  const fallback = clampText(sourceText, MAX_SUMMARY_CHARS) || 'No summary available.';
  const enabled = normalizeBooleanFlag(context.env.LIFEOS_GOOGLE_BRIDGE_LLM_SUMMARY, true);
  if (!enabled) {
    return fallback;
  }

  const promptInput = clampText(sourceText, MAX_INPUT_CHARS);
  if (!promptInput) {
    return 'No summary available.';
  }

  const host = context.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST;
  const model = context.env.LIFEOS_GOOGLE_BRIDGE_SUMMARY_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutMs = parseTimeoutMs(context.env.LIFEOS_GOOGLE_BRIDGE_SUMMARY_TIMEOUT_MS);
  const endpoint = `${host.replace(/\/+$/, '')}/api/chat`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          temperature: 0.1,
          num_ctx: 4096,
        },
        messages: [
          {
            role: 'system',
            content:
              'Summarize the text in 1-2 short sentences for a busy user. Avoid bullet points.',
          },
          {
            role: 'user',
            content: promptInput,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return fallback;
    }

    const payload = (await response.json()) as {
      message?: {
        content?: unknown;
      };
    };
    const content =
      typeof payload.message?.content === 'string' ? payload.message.content.trim() : '';
    return content ? clampText(content, MAX_SUMMARY_CHARS) : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
