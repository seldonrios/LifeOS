import { ImapFlow } from 'imapflow';

import type { ImapCredentials, RawMessage } from './events';

export interface ImapFlowLike {
  connect(): Promise<void>;
  mailboxOpen(path: string): Promise<void>;
  fetch(
    range: string,
    query: Record<string, unknown>,
    options: Record<string, unknown>,
  ): AsyncIterable<Record<string, unknown>>;
  messageFlagsAdd(uid: number, flags: string[]): Promise<void>;
  logout(): Promise<void>;
}

export type ImapClientFactory = (credentials: ImapCredentials) => ImapFlowLike;

const DEFAULT_OPERATION_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 12_000;

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBody(source: unknown): string {
  if (typeof source === 'string') {
    return stripHtml(source).slice(0, MAX_BODY_CHARS);
  }
  if (source instanceof Uint8Array) {
    return stripHtml(Buffer.from(source).toString('utf8')).slice(0, MAX_BODY_CHARS);
  }
  if (source && typeof source === 'object' && 'toString' in source) {
    const rendered = String(source);
    return stripHtml(rendered).slice(0, MAX_BODY_CHARS);
  }
  return '';
}

function timeoutAfter<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function* timeoutIterator<T>(
  iterator: AsyncIterable<T>,
  timeoutMs: number,
): AsyncGenerator<T, void, unknown> {
  const iterNext = iterator[Symbol.asyncIterator]();
  while (true) {
    try {
      const nextPromise = iterNext.next();
      const result = await timeoutAfter(
        nextPromise as Promise<IteratorResult<T, void>>,
        timeoutMs,
        'IMAP fetch iteration timed out.',
      );
      if (result.done) {
        break;
      }
      yield result.value;
    } catch (error: unknown) {
      // Propagate timeout errors to caller for degradable handling
      throw error;
    }
  }
}

export function createImapFlowFactory(): ImapClientFactory {
  return (credentials: ImapCredentials) => {
    return new ImapFlow({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.secure,
      auth: credentials.auth,
      logger: false,
    }) as unknown as ImapFlowLike;
  };
}

export async function fetchUnreadMessages(
  credentials: ImapCredentials,
  limit: number,
  markRead: boolean,
  factory: ImapClientFactory,
): Promise<RawMessage[]> {
  const client = factory(credentials);
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const messages: RawMessage[] = [];

  try {
    await timeoutAfter(client.connect(), DEFAULT_OPERATION_TIMEOUT_MS, 'IMAP connect timed out.');
    await timeoutAfter(
      client.mailboxOpen('INBOX'),
      DEFAULT_OPERATION_TIMEOUT_MS,
      'IMAP mailbox open timed out.',
    );

    const iterator = client.fetch(
      '1:*',
      { unseen: true },
      { uid: true, envelope: true, source: true },
    );
    for await (const row of timeoutIterator(iterator, DEFAULT_OPERATION_TIMEOUT_MS)) {
      const envelope = row.envelope as
        | {
            subject?: unknown;
            from?: Array<{ name?: unknown; address?: unknown }>;
            messageId?: unknown;
            date?: unknown;
          }
        | undefined;
      const fromEntry = envelope?.from?.[0];
      const senderName = getString(fromEntry?.name);
      const senderAddress = getString(fromEntry?.address);
      const from =
        senderName && senderAddress
          ? `${senderName} <${senderAddress}>`
          : senderAddress || senderName || 'Unknown sender';

      const receivedAtSource = envelope?.date;
      const receivedAt =
        receivedAtSource instanceof Date && Number.isFinite(receivedAtSource.getTime())
          ? receivedAtSource.toISOString()
          : new Date().toISOString();

      const messageId =
        getString(envelope?.messageId) || `imap-${credentials.label}-${messages.length + 1}`;
      messages.push({
        subject: getString(envelope?.subject) || '(no subject)',
        from,
        messageId,
        receivedAt,
        body: toBody(row.source),
        accountLabel: credentials.label,
      });

      if (markRead) {
        const uid = typeof row.uid === 'number' ? row.uid : null;
        if (uid) {
          await timeoutAfter(
            client.messageFlagsAdd(uid, ['\\Seen']),
            DEFAULT_OPERATION_TIMEOUT_MS,
            'IMAP mark-read timed out.',
          );
        }
      }

      if (messages.length >= safeLimit) {
        break;
      }
    }

    return messages;
  } finally {
    try {
      await timeoutAfter(client.logout(), DEFAULT_OPERATION_TIMEOUT_MS, 'IMAP logout timed out.');
    } catch {
      // Ignore close errors to keep voice flow resilient.
    }
  }
}
