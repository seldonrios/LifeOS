import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AssistantProfileInputSchema, type AssistantProfile } from '@lifeos/contracts';

import { extractCallerUserId } from '../auth';

const DEFAULT_ASSISTANT_NAME = 'LifeOS';
const DEFAULT_WAKE_PHRASE = 'Hey LifeOS';
const DEFAULT_ASSISTANT_TONE = 'concise' as const;
const DEFAULT_AVATAR_EMOJI = '🤖';

interface AssistantProfileRow {
  user_id: string;
  assistant_name: string;
  wake_phrase: string;
  assistant_tone: string;
  use_cases_json: string;
  avatar_emoji: string;
  updated_at: string;
}

/**
 * Minimal structural interface for the SQLite database operations needed by this route.
 * Accepts a better-sqlite3 Database instance or any compatible object.
 */
export interface AssistantProfileDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): void;
    get(...params: unknown[]): unknown;
  };
}

function rowToProfile(row: AssistantProfileRow): AssistantProfile {
  return {
    userId: row.user_id,
    assistantName: row.assistant_name,
    wakePhrase: row.wake_phrase,
    assistantTone: row.assistant_tone as 'concise' | 'detailed' | 'conversational',
    useCases: JSON.parse(row.use_cases_json) as string[],
    avatarEmoji: row.avatar_emoji,
    updatedAt: row.updated_at,
  };
}

function defaultProfile(userId: string): AssistantProfile {
  return {
    userId,
    assistantName: DEFAULT_ASSISTANT_NAME,
    wakePhrase: DEFAULT_WAKE_PHRASE,
    assistantTone: DEFAULT_ASSISTANT_TONE,
    useCases: [],
    avatarEmoji: DEFAULT_AVATAR_EMOJI,
    updatedAt: new Date().toISOString(),
  };
}

export function registerAssistantProfileRoutes(
  app: FastifyInstance,
  db: AssistantProfileDatabase,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_profiles (
      user_id       TEXT PRIMARY KEY,
      assistant_name TEXT NOT NULL,
      wake_phrase   TEXT NOT NULL,
      assistant_tone TEXT NOT NULL,
      use_cases_json TEXT NOT NULL,
      avatar_emoji  TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    )
  `);

  app.route({
    method: 'GET',
    url: '/api/assistant-profile',
    config: { accessMode: 'bearer' },
    handler: async (request, reply) => {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const query = z
        .object({
          userId: z.string().trim().min(1).optional(),
        })
        .safeParse(request.query);

      if (!query.success) {
        reply.status(400).send({ error: 'Invalid query parameters' });
        return;
      }

      const targetUserId = query.data.userId ?? callerUserId;

      if (targetUserId !== callerUserId) {
        const sharedHousehold = db
          .prepare(
            `SELECT 1
             FROM household_members caller
             INNER JOIN household_members target
               ON caller.household_id = target.household_id
             WHERE caller.user_id = ?
               AND target.user_id = ?
               AND caller.status = 'active'
               AND target.status = 'active'
             LIMIT 1`,
          )
          .get(callerUserId, targetUserId);

        if (!sharedHousehold) {
          reply.status(403).send({ error: 'Forbidden' });
          return;
        }
      }

      const row = db
        .prepare('SELECT * FROM assistant_profiles WHERE user_id = ?')
        .get(targetUserId) as AssistantProfileRow | undefined;

      if (!row) {
        reply.send(defaultProfile(targetUserId));
        return;
      }

      reply.send(rowToProfile(row));
    },
  });

  app.route({
    method: 'PUT',
    url: '/api/assistant-profile',
    config: { accessMode: 'bearer' },
    handler: async (request, reply) => {
      const userId = await extractCallerUserId(request);
      if (!userId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const parsed = AssistantProfileInputSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({ error: 'Invalid request body', details: parsed.error.errors });
        return;
      }

      const { assistantName, wakePhrase, assistantTone, useCases, avatarEmoji } = parsed.data;
      const updatedAt = new Date().toISOString();

      db.prepare(
        `INSERT OR REPLACE INTO assistant_profiles
           (user_id, assistant_name, wake_phrase, assistant_tone, use_cases_json, avatar_emoji, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        assistantName,
        wakePhrase,
        assistantTone,
        JSON.stringify(useCases),
        avatarEmoji,
        updatedAt,
      );

      const saved: AssistantProfile = {
        userId,
        assistantName,
        wakePhrase,
        assistantTone,
        useCases,
        avatarEmoji,
        updatedAt,
      };

      reply.send(saved);
    },
  });
}
