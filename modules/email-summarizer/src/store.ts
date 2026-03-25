import type { LifeGraphClient } from '@lifeos/life-graph';

import type { SummarizedMessage } from './events';

export async function persistEmailDigests(
  client: LifeGraphClient,
  messages: SummarizedMessage[],
): Promise<string[]> {
  const ids: string[] = [];
  const seenMessageIds = new Set<string>();
  for (const message of messages) {
    if (seenMessageIds.has(message.messageId)) {
      continue;
    }
    seenMessageIds.add(message.messageId);
    const saved = await client.appendEmailDigest({
      subject: message.subject,
      from: message.from,
      summary: message.summary,
      messageId: message.messageId,
      receivedAt: message.receivedAt,
      read: message.read,
      accountLabel: message.accountLabel,
    });
    if (typeof saved.id === 'string' && saved.id.trim().length > 0) {
      ids.push(saved.id);
    }
  }
  return ids;
}
