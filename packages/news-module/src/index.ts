import { CacheManager } from '@lifeos/module-cache';
import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';
import { TextToSpeech } from '@lifeos/voice-core';

interface VoiceNewsPayload {
  topic?: unknown;
  query?: unknown;
  utterance?: unknown;
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

interface Headline {
  title: string;
  link: string;
}

interface NewsCacheEntry {
  title: string;
  summary: string;
  sources: string[];
}

interface SpeechOutput {
  speak(text: string): Promise<void>;
}

export interface NewsModuleOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
  cache?: CacheManager<NewsCacheEntry>;
  tts?: SpeechOutput;
}

const NEWS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_NEWS_MODEL = 'llama3.1:8b';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_HEADLINES = 6;
const MAX_TITLE_CHARS = 220;
const MAX_SUMMARY_CHARS = 5000;
const MAX_SOURCE_LINKS = 20;
const DEFAULT_FEEDS = [
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://feeds.arstechnica.com/arstechnica/technology-lab',
  'https://www.theverge.com/rss/index.xml',
];

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

function cacheKey(topic: string): string {
  return `news:${topic.toLowerCase()}`;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
  return decodeXml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(itemXml: string, tag: string): string | null {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match?.[1]) {
    return null;
  }
  return stripTags(match[1]);
}

function extractHeadlines(xml: string): Headline[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((itemXml) => {
      const title = extractTag(itemXml, 'title');
      const link = extractTag(itemXml, 'link');
      if (!title || !link) {
        return null;
      }
      return {
        title: clampText(title, MAX_TITLE_CHARS),
        link,
      };
    })
    .filter((entry): entry is Headline => entry !== null);
}

function resolveTimeoutMs(context: ModuleRuntimeContext): number {
  const raw = Number.parseInt(context.env.LIFEOS_NEWS_TIMEOUT_MS ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return raw;
}

function resolveFeeds(context: ModuleRuntimeContext): string[] {
  const configured = context.env.LIFEOS_NEWS_FEEDS?.trim();
  if (!configured) {
    return DEFAULT_FEEDS;
  }
  const feeds = configured
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return feeds.length > 0 ? feeds : DEFAULT_FEEDS;
}

function resolveTopic(payload: VoiceNewsPayload): string {
  const direct = getString(payload.topic) ?? getString(payload.query);
  if (direct) {
    return clampText(direct, 80);
  }
  const utterance = getString(payload.utterance);
  if (utterance) {
    const lowered = utterance.toLowerCase();
    if (lowered.includes('tech')) {
      return 'tech';
    }
    if (lowered.includes('business')) {
      return 'business';
    }
    if (lowered.includes('world')) {
      return 'world';
    }
  }
  return 'top';
}

async function speakFeedback(
  tts: SpeechOutput,
  text: string,
  context: ModuleRuntimeContext,
): Promise<void> {
  try {
    await tts.speak(text);
  } catch (error: unknown) {
    context.log(`[News] TTS degraded: ${normalizeErrorMessage(error)}`);
  }
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'news-module');
  } catch (error: unknown) {
    context.log(`[News] publish degraded (${topic}): ${normalizeErrorMessage(error)}`);
  }
}

async function fetchFeedXml(
  url: string,
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs(context));
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'lifeos-news-module',
      },
    });
    if (!response.ok) {
      throw new Error(`news feed request failed (${response.status})`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function collectHeadlines(
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
): Promise<Headline[]> {
  const feeds = resolveFeeds(context);
  const aggregated: Headline[] = [];

  for (const feed of feeds) {
    try {
      const xml = await fetchFeedXml(feed, context, fetchFn);
      const headlines = extractHeadlines(xml);
      for (const entry of headlines) {
        aggregated.push(entry);
        if (aggregated.length >= MAX_HEADLINES) {
          return aggregated;
        }
      }
    } catch (error: unknown) {
      context.log(`[News] feed degraded (${feed}): ${normalizeErrorMessage(error)}`);
    }
  }

  if (aggregated.length === 0) {
    throw new Error('no headlines available from configured feeds');
  }
  return aggregated;
}

async function summarizeHeadlines(
  topic: string,
  headlines: Headline[],
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
): Promise<string> {
  const useOllama = context.env.LIFEOS_NEWS_USE_OLLAMA?.trim() !== '0';
  const fallbackSummary = clampText(
    `Top ${topic} headlines: ${headlines.map((item) => item.title).join('; ')}.`,
    MAX_SUMMARY_CHARS,
  );
  if (!useOllama) {
    return fallbackSummary;
  }

  const model =
    context.env.LIFEOS_NEWS_MODEL?.trim() ||
    context.env.LIFEOS_VOICE_MODEL?.trim() ||
    context.env.LIFEOS_GOAL_MODEL?.trim() ||
    DEFAULT_NEWS_MODEL;
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
              'Summarize the provided headlines in 2-3 concise sentences for a daily spoken briefing.',
          },
          {
            role: 'user',
            content: `Topic: ${topic}\nHeadlines:\n${headlines
              .map((item, index) => `${index + 1}. ${item.title}`)
              .join('\n')}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`news summarizer request failed (${response.status})`);
    }

    const parsed = (await response.json()) as OllamaChatResponse;
    const content = getString(parsed.message?.content);
    if (!content) {
      throw new Error('news summarizer returned empty content');
    }
    return clampText(content, MAX_SUMMARY_CHARS);
  } catch (error: unknown) {
    context.log(`[News] summarizer degraded: ${normalizeErrorMessage(error)}`);
    return fallbackSummary;
  } finally {
    clearTimeout(timeout);
  }
}

function toVoicePayload(event: BaseEvent<Record<string, unknown>>): VoiceNewsPayload {
  return {
    topic: event.data.topic,
    query: event.data.query,
    utterance: event.data.utterance,
  };
}

function toAgentPayload(event: BaseEvent<AgentWorkPayload>): VoiceNewsPayload | null {
  if (event.data.intent !== 'news') {
    return null;
  }
  const nested =
    event.data.payload &&
    typeof event.data.payload === 'object' &&
    !Array.isArray(event.data.payload)
      ? (event.data.payload as Record<string, unknown>)
      : {};
  return {
    topic: nested.topic ?? nested.query,
    query: nested.query,
    utterance: event.data.utterance,
  };
}

async function loadFallbackDigest(
  client: LifeGraphClient,
  cache: CacheManager<NewsCacheEntry>,
  topic: string,
  context: ModuleRuntimeContext,
): Promise<NewsCacheEntry | null> {
  const cached = cache.get(cacheKey(topic));
  if (cached) {
    return cached;
  }

  const queryCandidates: Array<string | undefined> = [topic, undefined];
  for (const candidate of queryCandidates) {
    try {
      const latest = await client.getLatestNewsDigest(candidate);
      if (!latest) {
        continue;
      }
      const fallback = {
        title: latest.title,
        summary: latest.summary,
        sources: latest.sources,
      };
      cache.set(cacheKey(topic), fallback, NEWS_CACHE_TTL_MS);
      return fallback;
    } catch (error: unknown) {
      context.log(
        `[News] fallback digest lookup degraded (${candidate ?? 'latest'}): ${normalizeErrorMessage(error)}`,
      );
    }
  }

  return null;
}

export function createNewsModule(options: NewsModuleOptions = {}): LifeOSModule {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => new Date());
  const cache = options.cache ?? new CacheManager<NewsCacheEntry>();
  const tts = options.tts ?? new TextToSpeech();

  async function handleNews(
    payload: VoiceNewsPayload,
    context: ModuleRuntimeContext,
  ): Promise<void> {
    const topic = resolveTopic(payload);
    const client = createClient(context);

    try {
      const headlines = await collectHeadlines(context, fetchFn);
      const summary = await summarizeHeadlines(topic, headlines, context, fetchFn);
      const sources = headlines.map((entry) => entry.link).slice(0, MAX_SOURCE_LINKS);
      const title = clampText(`Top ${topic} news`, MAX_TITLE_CHARS);
      const saved = await client.appendNewsDigest({
        title,
        summary,
        sources,
        read: false,
      });
      cache.set(
        cacheKey(topic),
        { title: saved.title, summary: saved.summary, sources: saved.sources },
        NEWS_CACHE_TTL_MS,
      );
      await publishSafe(context, Topics.lifeos.newsDigestReady, {
        id: saved.id,
        title: saved.title,
        summary: saved.summary,
        sourceCount: saved.sources.length,
        createdAt: now().toISOString(),
        degraded: false,
      });
      await speakFeedback(tts, `Done. ${saved.summary}`, context);
      return;
    } catch (error: unknown) {
      context.log(`[News] fetch degraded: ${normalizeErrorMessage(error)}`);
    }

    const fallback = await loadFallbackDigest(client, cache, topic, context);
    if (!fallback) {
      const summary = `No internet. I do not have a cached ${topic} digest yet.`;
      await publishSafe(context, Topics.lifeos.newsDigestReady, {
        title: `Top ${topic} news`,
        summary,
        sourceCount: 0,
        createdAt: now().toISOString(),
        degraded: true,
      });
      await speakFeedback(tts, `Done. ${summary}`, context);
      return;
    }

    await publishSafe(context, Topics.lifeos.newsDigestReady, {
      title: fallback.title,
      summary: fallback.summary,
      sourceCount: fallback.sources.length,
      createdAt: now().toISOString(),
      degraded: true,
    });
    await speakFeedback(
      tts,
      `Done. No internet. Here's the last summary I have: ${fallback.summary}`,
      context,
    );
  }

  return {
    id: 'news',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentNews,
        async (event) => {
          try {
            await handleNews(toVoicePayload(event), context);
          } catch (error: unknown) {
            context.log(`[News] voice intent degraded: ${normalizeErrorMessage(error)}`);
          }
        },
      );

      await context.subscribe<AgentWorkPayload>(Topics.agent.workRequested, async (event) => {
        const payload = toAgentPayload(event);
        if (!payload) {
          return;
        }
        try {
          await handleNews(payload, context);
        } catch (error: unknown) {
          context.log(`[News] agent work degraded: ${normalizeErrorMessage(error)}`);
        }
      });
    },
  };
}

export const newsModule = createNewsModule();
