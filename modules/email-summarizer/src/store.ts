import type { LifeGraphClient } from '@lifeos/life-graph';

import type { SummarizedMessage } from './events';

export async function persistEmailDigests(
  client: LifeGraphClient,
  messages: SummarizedMessage[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const message of messages) {
    const saved = await client.appendEmailDigest({
      subject: message.subject,
      from: message.from,
      summary: message.summary,
      messageId: message.messageId,
      receivedAt: message.receivedAt,
      read: message.read,
      accountLabel: message.accountLabel,
    });
    ids.push(saved.id);
  }
  return ids;
}
