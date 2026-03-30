import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
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
