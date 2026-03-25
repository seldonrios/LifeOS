import { TextToSpeech } from '@lifeos/voice-core';
import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

import { readCredentials } from './credentials';
import { EmailTopics, type ImapCredentials, type VoiceEmailSummarizePayload } from './events';
import { emailSummarizerSchema } from './schema';
import { createImapFlowFactory, fetchUnreadMessages, type ImapClientFactory } from './imap-client';
import { summarizeMessages } from './summarizer';
import { persistEmailDigests } from './store';

interface SpeechOutput {
  speak(text: string): Promise<void>;
}

export interface EmailSummarizerModuleOptions {
  fetchFn?: typeof fetch;
  tts?: SpeechOutput;
  readCredentialsFn?: (env: NodeJS.ProcessEnv) => Promise<ImapCredentials[]>;
  imapFactory?: ImapClientFactory;
}

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

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(25, Math.trunc(value)));
  }
  return 10;
}

function resolveMarkRead(env: NodeJS.ProcessEnv): boolean {
  const raw = env.LIFEOS_EMAIL_MARK_READ?.trim();
  return raw !== '0' && raw?.toLowerCase() !== 'false';
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function speakSafe(
  tts: SpeechOutput,
  text: string,
  context: ModuleRuntimeContext,
): Promise<void> {
  try {
    await tts.speak(text);
  } catch (error: unknown) {
    context.log(`[EmailSummarizer] TTS degraded: ${normalizeError(error)}`);
  }
}

async function publishSafe(
  context: ModuleRuntimeContext,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await context.publish(topic, data, 'email-summarizer');
  } catch (error: unknown) {
    context.log(`[EmailSummarizer] publish degraded (${topic}): ${normalizeError(error)}`);
  }
}

function toVoicePayload(event: BaseEvent<Record<string, unknown>>): VoiceEmailSummarizePayload {
  return {
    account: event.data.account,
    limit: event.data.limit,
    utterance: event.data.utterance,
  };
}

function accountMatches(requested: string | null, credential: ImapCredentials): boolean {
  if (!requested) {
    return true;
  }
  return credential.label.toLowerCase() === requested.toLowerCase();
}

async function runSummarization(
  payload: VoiceEmailSummarizePayload,
  context: ModuleRuntimeContext,
  options: Required<
    Pick<EmailSummarizerModuleOptions, 'fetchFn' | 'tts' | 'readCredentialsFn' | 'imapFactory'>
  >,
): Promise<void> {
  const client = createClient(context);
  const requestedAccount = getString(payload.account);
  const limit = resolveLimit(payload.limit);
  const credentials = await options.readCredentialsFn(context.env);
  if (credentials.length === 0) {
    context.log(
      '[EmailSummarizer] No IMAP accounts configured. Run module setup email-summarizer.',
    );
    await speakSafe(options.tts, 'Email summarizer is not configured yet.', context);
    return;
  }

  const selected = credentials.filter((entry) => accountMatches(requestedAccount, entry));
  if (selected.length === 0) {
    const label = requestedAccount || 'requested';
    context.log(`[EmailSummarizer] No IMAP account matched "${label}".`);
    await speakSafe(options.tts, `No configured account matched ${label}.`, context);
    return;
  }

  const markRead = resolveMarkRead(context.env);
  let total = 0;

  for (const account of selected) {
    try {
      const unread = await fetchUnreadMessages(account, limit, markRead, options.imapFactory);
      if (unread.length === 0) {
        continue;
      }
      const summarized = await summarizeMessages(unread, context.env, options.fetchFn);
      const digestIds = await persistEmailDigests(client, summarized);
      total += digestIds.length;
      await publishSafe(context, EmailTopics.digestReady, {
        count: digestIds.length,
        accountLabel: account.label,
        digestIds,
        summarizedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      context.log(`[EmailSummarizer] Account ${account.label} degraded: ${normalizeError(error)}`);
    }
  }

  await speakSafe(
    options.tts,
    total > 0
      ? `I summarized ${total} unread email${total === 1 ? '' : 's'}.`
      : 'No unread email needed summarizing.',
    context,
  );
}

async function publishBriefingHint(context: ModuleRuntimeContext): Promise<void> {
  const client = createClient(context);
  try {
    const graph = await client.loadGraph();
    const count = graph.emailDigests?.length ?? 0;
    if (count <= 0) {
      return;
    }
    await publishSafe(context, Topics.lifeos.orchestratorSuggestion, {
      message: `Inbox summary: ${count} recent email digest${count === 1 ? '' : 's'} available.`,
      source: 'email-summarizer',
      category: 'briefing-context',
    });
  } catch (error: unknown) {
    context.log(`[EmailSummarizer] briefing hint degraded: ${normalizeError(error)}`);
  }
}

export function createEmailSummarizerModule(
  options: EmailSummarizerModuleOptions = {},
): LifeOSModule {
  const resolved = {
    fetchFn: options.fetchFn ?? fetch,
    tts: options.tts ?? new TextToSpeech(),
    readCredentialsFn: options.readCredentialsFn ?? readCredentials,
    imapFactory: options.imapFactory ?? createImapFlowFactory(),
  };

  return {
    id: 'email-summarizer',
    async init(context: ModuleRuntimeContext): Promise<void> {
      const client = createClient(context);
      await client.registerModuleSchema(emailSummarizerSchema);

      await context.subscribe<Record<string, unknown>>(
        EmailTopics.voiceIntentSummarize,
        async (event) => {
          try {
            await runSummarization(toVoicePayload(event), context, resolved);
          } catch (error: unknown) {
            context.log(`[EmailSummarizer] summarize intent degraded: ${normalizeError(error)}`);
          }
        },
      );

      await context.subscribe<Record<string, unknown>>(
        EmailTopics.voiceIntentBriefing,
        async () => {
          await publishBriefingHint(context);
        },
      );
    },
  };
}

export const emailSummarizerModule = createEmailSummarizerModule();

export { getCredentialsFilePath, readCredentials, writeCredentials } from './credentials';
export type { ImapCredentials } from './events';
