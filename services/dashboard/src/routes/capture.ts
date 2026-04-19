import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
  type CaptureListItem,
  CaptureRequestSchema,
  CaptureResultSchema,
  HouseholdVoiceCaptureCreatedSchema,
} from '@lifeos/contracts';
import { type BaseEvent, type ManagedEventBus, Topics } from '@lifeos/event-bus';
import { HouseholdGraphClient } from '@lifeos/household-identity-module';
import { z } from 'zod';

import { extractCallerUserId } from '../auth';

interface CaptureLifeGraphClient {
  appendCaptureEntry(entry: {
    id: string;
    content: string;
    type: 'text' | 'voice';
    capturedAt: string;
    source: string;
    tags: string[];
    status: 'pending' | 'triaged';
    metadata?: {
      scope?: 'household';
      householdId?: string;
      source?: 'mobile' | 'ha_satellite' | 'ha_bridge';
      sourceDeviceId?: string;
      targetHint?: 'shopping' | 'chore' | 'reminder' | 'note' | 'unknown';
    };
  }): Promise<void>;
  loadGraph(): Promise<{
    captureEntries?: Array<{
      id: string;
      content: string;
      type: string;
      capturedAt: string;
      source: string;
      tags: string[];
      status: string;
    }>;
  }>;
}

async function publishHouseholdEvent<T extends Record<string, unknown>>(
  eventBus: ManagedEventBus,
  topic: string,
  data: T,
  householdId: string,
  actorId: string,
  traceId: string,
): Promise<void> {
  const event: BaseEvent<T> = {
    id: randomUUID(),
    type: topic,
    timestamp: new Date().toISOString(),
    source: 'dashboard-service',
    version: '1',
    data,
    metadata: {
      household_id: householdId,
      actor_id: actorId,
      trace_id: traceId,
    },
  };

  await eventBus.publish(topic, event);
}

function buildCaptureEntry(body: z.infer<typeof CaptureRequestSchema>) {
  return {
    id: randomUUID(),
    content: body.content,
    type: body.type,
    capturedAt: new Date().toISOString(),
    source: 'dashboard',
    tags: body.tags ?? [],
    status: 'pending' as const,
    metadata: body.metadata,
  };
}

export function registerCaptureRoutes(
  app: FastifyInstance,
  db: HouseholdGraphClient,
  eventBus: ManagedEventBus,
  lifeGraph: CaptureLifeGraphClient,
): void {
  app.get('/api/captures', async (request, reply) => {
    const callerUserId = await extractCallerUserId(request);
    if (!callerUserId) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const queryString = request.url.includes('?') ? request.url.slice(request.url.indexOf('?') + 1) : '';
    const queryParams = new URLSearchParams(queryString);

    const q = queryParams.get('q')?.trim() ?? '';
    const limitParam = queryParams.get('limit');
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
    const offsetParam = queryParams.get('offset');
    const parsedOffset = offsetParam ? Number.parseInt(offsetParam, 10) : Number.NaN;
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    const graph = await lifeGraph.loadGraph();
    const entries = graph.captureEntries ?? [];

    const filtered = q
      ? entries.filter((entry) => entry.content.toLowerCase().includes(q.toLowerCase()))
      : entries;

    const results: CaptureListItem[] = filtered.slice(offset, offset + limit).map((entry) => ({
      id: entry.id,
      content: entry.content,
      capturedAt: entry.capturedAt,
      type: entry.type,
      source: entry.source,
      tags: entry.tags,
      status: entry.status,
    }));

    reply.status(200).send(results);
  });

  app.post('/api/capture', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const body = CaptureRequestSchema.parse(request.body);

      if (body.metadata?.scope === 'household') {
        const householdId = body.metadata.householdId?.trim();
        if (!householdId) {
          reply.status(400).send({ error: 'householdId is required for household scope' });
          return;
        }

        const household = db.getHousehold(householdId);
        if (!household) {
          reply.status(400).send({ error: 'Invalid householdId' });
          return;
        }

        const member = db.getMember(householdId, callerUserId);
        if (!member || member.status !== 'active') {
          reply.status(403).send({ error: 'Forbidden' });
          return;
        }

        const entry = buildCaptureEntry(body);
        await lifeGraph.appendCaptureEntry(entry);

        const result = CaptureResultSchema.parse({
          id: entry.id,
          type: entry.type,
          content: entry.content,
          processedAt: Date.now(),
          status: 'success',
        });

        reply.status(201).send(result);

        void (async () => {
          const eventData = HouseholdVoiceCaptureCreatedSchema.parse({
            captureId: entry.id,
            householdId,
            actorUserId: callerUserId,
            text: body.content,
            audioRef: null,
            source: body.metadata?.source ?? 'mobile',
            sourceDeviceId: body.metadata?.sourceDeviceId,
            targetHint: body.metadata?.targetHint,
            createdAt: entry.capturedAt,
          });
          await publishHouseholdEvent(
            eventBus,
            Topics.lifeos.householdVoiceCaptureCreated,
            eventData,
            householdId,
            callerUserId,
            request.id,
          );
        })().catch((error) => {
          app.log.error(error);
        });

        return;
      }

      const entry = buildCaptureEntry(body);
      await lifeGraph.appendCaptureEntry(entry);

      const result = CaptureResultSchema.parse({
        id: entry.id,
        type: entry.type,
        content: entry.content,
        processedAt: Date.now(),
        status: 'success',
      });

      reply.status(201).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid request', details: error.issues });
        return;
      }

      reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
