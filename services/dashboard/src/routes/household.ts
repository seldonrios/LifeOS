import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
  HouseholdAutomationFailedSchema,
  HouseholdCalendarEventCreatedSchema,
  HouseholdCaptureStatusResponseSchema,
  HouseholdChoreAssignedSchema,
  HouseholdChoreCompletedSchema,
  HouseholdAddShoppingItemRequestSchema,
  HouseholdChangeMemberRoleRequestSchema,
  HouseholdCreateChoreRequestSchema,
  HouseholdCreateNoteRequestSchema,
  HouseholdCreateReminderRequestSchema,
  HouseholdCreateRequestSchema,
  HouseholdInviteMemberRequestSchema,
  HouseholdJoinRequestSchema,
  HouseholdMemberInvitedSchema,
  HouseholdMemberJoinedSchema,
  HouseholdMemberRoleChangedSchema,
  HouseholdHaWebhookRequestSchema,
  HouseholdHomeStateConfigSchema,
  HouseholdContextSummarySchema,
  HouseholdUpdateConfigRequestSchema,
  HouseholdShoppingItemAddedSchema,
  HouseholdShoppingItemPurchasedSchema,
  HouseholdUpdateShoppingItemStatusRequestSchema,
  HouseholdVoiceCaptureCreatedSchema,
  HouseholdHomeStateChangedSchema,
} from '@lifeos/contracts';
import { type BaseEvent, type ManagedEventBus, Topics } from '@lifeos/event-bus';
import {
  type CalendarPublishContext,
  generateIcs,
  publishCalendarEventCreated,
} from '@lifeos/household-calendar-module';
import {
  publishChoreAssigned,
  publishChoreCompleted,
  resolveChoreAutomationFailure,
  type ChorePublishContext,
} from '@lifeos/household-chores-module';
import {
  publishShoppingItemAdded,
  publishShoppingItemPurchased,
  type ShoppingPublishContext,
} from '@lifeos/household-shopping-module';
import {
  HouseholdGraphClient,
  InvalidAttendeeError,
  InvalidShoppingItemTransitionError,
  canPerform,
  generateInviteExpiry,
  generateInviteToken,
} from '@lifeos/household-identity-module';
import {
  buildHaVoiceCaptureEventData,
  buildHomeStateChangedEventData,
  isStateKeyConsented,
  parseHouseholdHomeStateConfig,
  validateWebhookSecret,
} from '@lifeos/home-state-module';
import { createObservabilityClient, emitAutomationFailureSpan } from '@lifeos/observability';
import { z } from 'zod';

import { extractCallerUserId } from '../auth';

type StatusSentinel = {
  status: number;
  message?: string;
};

const ReminderObjectTypeSchema = z.enum(['chore', 'event', 'shopping', 'routine', 'custom']);

function makeStatusError(status: number, message?: string): StatusSentinel {
  return message === undefined ? { status } : { status, message };
}

function isStatusError(error: unknown): error is StatusSentinel {
  return (
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

function isZodLikeError(error: unknown): error is { issues: unknown[] } {
  return (
    !!error &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCalendarRangeFilter(value: string, boundary: 'start' | 'end'): string {
  if (DATE_ONLY_PATTERN.test(value)) {
    const suffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
    return `${value}${suffix}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Calendar date filters must be valid ISO dates or datetimes');
  }

  return parsed.toISOString();
}

async function requireMember(
  db: HouseholdGraphClient,
  householdId: string,
  userId: string,
  action: string,
): Promise<void> {
  const household = db.getHousehold(householdId);
  if (!household) {
    throw makeStatusError(404, 'Household not found');
  }

  const member = db.getMember(householdId, userId);
  if (!member || member.status !== 'active') {
    throw makeStatusError(403, 'Forbidden');
  }

  if (!canPerform(member.role, action)) {
    throw makeStatusError(403, 'Insufficient role');
  }
}

function replyError(reply: { status: (code: number) => { send: (body: unknown) => void } }, error: unknown) {
  if (isZodLikeError(error)) {
    reply.status(400).send({ error: 'Invalid request', details: error.issues });
    return;
  }

  if (error instanceof InvalidShoppingItemTransitionError) {
    reply.status(400).send({ error: (error as Error).message });
    return;
  }

  if (error instanceof InvalidAttendeeError) {
    reply.status(400).send({ error: (error as Error).message });
    return;
  }

  if (isStatusError(error)) {
    reply.status(error.status).send({ error: error.message ?? 'Request failed' });
    return;
  }

  if (error instanceof Error) {
    if (/forbidden/i.test(error.message)) {
      reply.status(403).send({ error: 'Forbidden' });
      return;
    }
    if (/not found/i.test(error.message)) {
      reply.status(404).send({ error: error.message });
      return;
    }
    if (/expired|invalid/i.test(error.message)) {
      reply.status(400).send({ error: error.message });
      return;
    }
  }

  reply.status(500).send({ error: 'Internal server error' });
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

async function publishAutomationFailure(
  eventBus: ManagedEventBus,
  payload: ReturnType<typeof HouseholdAutomationFailedSchema.parse>,
): Promise<void> {
  await publishHouseholdEvent(
    eventBus,
    Topics.lifeos.householdAutomationFailed,
    payload,
    payload.household_id,
    payload.actor_id,
    payload.trace_id ?? 'trace-missing',
  );
}

async function publishReminderFailureEvents(
  db: HouseholdGraphClient,
  eventBus: ManagedEventBus,
  input: {
    householdId: string;
    reminderId: string;
    objectType: 'chore' | 'event' | 'shopping' | 'routine' | 'custom';
    objectId: string;
    targetUserIds: string[];
    remindAt: string;
  },
): Promise<void> {
  const failures = db.evaluateReminderAutomationFailures(
    input.householdId,
    input.targetUserIds,
    input.remindAt,
  );
  if (failures.length === 0) {
    return;
  }

  const observability = createObservabilityClient({
    serviceName: 'dashboard-service',
    environment: process.env.LIFEOS_PROFILE?.trim() || process.env.NODE_ENV || 'development',
  });

  for (const failure of failures) {
    const span = emitAutomationFailureSpan(observability, 'household.reminder.fire', {
      householdId: input.householdId,
      actorId: 'system',
      actionType: 'household.reminder.fire',
      errorCode: failure.errorCode,
      fixSuggestion: failure.fixSuggestion,
      objectId: input.reminderId,
      objectRef: `reminder:${input.reminderId}`,
      details: {
        target_user_id: failure.targetUserId,
      },
    });

    await publishAutomationFailure(
      eventBus,
      HouseholdAutomationFailedSchema.parse({
        household_id: input.householdId,
        actor_id: 'system',
        action_type: 'household.reminder.fire',
        error_code: failure.errorCode,
        fix_suggestion: failure.fixSuggestion,
        span_id: span.spanId,
        trace_id: span.traceId,
        object_id: input.reminderId,
        object_ref: `reminder:${input.reminderId}`,
        details: {
          target_user_id: failure.targetUserId,
        },
      }),
    );

    await publishHouseholdEvent(
      eventBus,
      Topics.lifeos.householdReminderFired,
      {
        householdId: input.householdId,
        reminderId: input.reminderId,
        objectType: input.objectType,
        objectId: input.objectId,
        targetUserIds: [failure.targetUserId],
        firedAt: new Date().toISOString(),
        deliveryStatus: failure.deliveryStatus,
      },
      input.householdId,
      'system',
      span.traceId,
    );
  }
}

function createChorePublishContext(
  eventBus: ManagedEventBus,
  householdId: string,
  actorId: string,
  traceId: string,
): ChorePublishContext {
  return {
    async publish<T extends Record<string, unknown>>(
      topic: string,
      data: T,
      source = 'dashboard-service',
    ): Promise<BaseEvent<T>> {
      const event: BaseEvent<T> = {
        id: randomUUID(),
        type: topic,
        timestamp: new Date().toISOString(),
        source,
        version: '1',
        data,
        metadata: {
          household_id: householdId,
          actor_id: actorId,
          trace_id: traceId,
        },
      };

      await eventBus.publish(topic, event);
      return event;
    },
  };
}

function createShoppingPublishContext(
  eventBus: ManagedEventBus,
  householdId: string,
  actorId: string,
  traceId: string,
): ShoppingPublishContext {
  return {
    async publish<T extends Record<string, unknown>>(
      topic: string,
      data: T,
      source = 'dashboard-service',
    ): Promise<BaseEvent<T>> {
      const event: BaseEvent<T> = {
        id: randomUUID(),
        type: topic,
        timestamp: new Date().toISOString(),
        source,
        version: '1',
        data,
        metadata: {
          household_id: householdId,
          actor_id: actorId,
          trace_id: traceId,
        },
      };

      await eventBus.publish(topic, event);
      return event;
    },
  };
}

function createCalendarPublishContext(
  eventBus: ManagedEventBus,
  householdId: string,
  actorId: string,
  traceId: string,
): CalendarPublishContext {
  return {
    async publish<T extends Record<string, unknown>>(
      topic: string,
      data: T,
      source = 'dashboard-service',
    ): Promise<BaseEvent<T>> {
      const event: BaseEvent<T> = {
        id: randomUUID(),
        type: topic,
        timestamp: new Date().toISOString(),
        source,
        version: '1',
        data,
        metadata: {
          household_id: householdId,
          actor_id: actorId,
          trace_id: traceId,
        },
      };

      await eventBus.publish(topic, event);
      return event;
    },
  };
}

export function registerHouseholdRoutes(
  app: FastifyInstance,
  db: HouseholdGraphClient,
  eventBus: ManagedEventBus,
): void {
  app.post('/api/households', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const body = HouseholdCreateRequestSchema.parse(request.body);

      const { household } = db.createHouseholdWithCreator(body.name, callerUserId, 'Admin');

      reply.status(201).send(household);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/members/invite', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdInviteMemberRequestSchema.parse(request.body);

      await requireMember(db, params.id, callerUserId, 'invite');

      const member = db.addMember(params.id, body.invitedUserId, body.role, callerUserId);
      const token = generateInviteToken();
      const expiresAt = generateInviteExpiry();
      const memberWithToken = db.storeInviteToken(params.id, body.invitedUserId, token, expiresAt);

      const eventData = HouseholdMemberInvitedSchema.parse({
        householdId: params.id,
        invitedUserId: body.invitedUserId,
        role: body.role,
        inviteToken: token,
        expiresAt,
      });
      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdMemberInvited,
        eventData,
        params.id,
        callerUserId,
        request.id,
      );

      reply.status(201).send({
        ...member,
        ...memberWithToken,
      });
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/members/join', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdJoinRequestSchema.parse(request.body);

      const member = db.acceptInviteForUser(body.inviteToken, params.id, callerUserId);
      const eventData = HouseholdMemberJoinedSchema.parse({
        householdId: params.id,
        userId: member.user_id,
        role: member.role,
        joinedAt: member.joined_at ?? new Date().toISOString(),
      });
      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdMemberJoined,
        eventData,
        params.id,
        callerUserId,
        request.id,
      );

      reply.status(200).send(member);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.patch('/api/households/:id/members/:userId/role', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          userId: z.string().min(1),
        })
        .parse(request.params);
      const body = HouseholdChangeMemberRoleRequestSchema.parse(request.body);

      await requireMember(db, params.id, callerUserId, 'change_role');
      const previousMember = db.getMember(params.id, params.userId);
      if (!previousMember) {
        throw makeStatusError(404, 'Member not found');
      }

      const member = db.updateMemberRole(params.id, params.userId, body.role);

      const eventData = HouseholdMemberRoleChangedSchema.parse({
        householdId: params.id,
        userId: params.userId,
        previousRole: previousMember.role,
        newRole: body.role,
      });
      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdMemberRoleChanged,
        eventData,
        params.id,
        callerUserId,
        request.id,
      );

      reply.status(200).send(member);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/shopping/items', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdAddShoppingItemRequestSchema.parse(request.body);

      await requireMember(db, params.id, callerUserId, 'add_shopping_item');
      const item = db.addShoppingItem(params.id, body.title, callerUserId, body.source, body.listId);
      reply.status(201).send(item);

      const eventData = HouseholdShoppingItemAddedSchema.parse({
        householdId: params.id,
        listId: item.list_id,
        itemId: item.id,
        title: item.title,
        addedByUserId: callerUserId,
        source: item.source,
      });
      void publishShoppingItemAdded(
        createShoppingPublishContext(eventBus, params.id, callerUserId, request.id),
        eventData,
      ).catch((error: unknown) => {
        app.log.error(error);
      });
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/shopping/lists', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      reply.status(200).send(db.listShoppingLists(params.id));
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/shopping/lists/:listId/items', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          listId: z.string().min(1),
        })
        .parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      const rows = db.listShoppingItems(params.id, params.listId).map((row) => ({
        id: row.id,
        title: row.title,
        addedBy: row.added_by_user_id,
        status: row.status,
        addedAt: row.created_at,
        purchasedAt: row.purchased_at ?? null,
      }));
      const items = rows.filter((row) => row.status !== 'purchased').concat(
        rows.filter((row) => row.status === 'purchased'),
      );

      reply.status(200).send(items);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.patch('/api/households/:id/shopping/items/:itemId/status', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          itemId: z.string().min(1),
        })
        .parse(request.params);
      const body = HouseholdUpdateShoppingItemStatusRequestSchema.parse(request.body);

      await requireMember(db, params.id, callerUserId, 'add_shopping_item');
      const item = db.updateShoppingItemStatus(params.id, params.itemId, body.status);
      reply.status(200).send(item);

      if (body.status === 'purchased') {
        const eventData = HouseholdShoppingItemPurchasedSchema.parse({
          householdId: params.id,
          listId: item.list_id,
          itemId: item.id,
          title: item.title,
          purchasedByUserId: callerUserId,
          purchasedAt: item.purchased_at ?? new Date().toISOString(),
        });
        void publishShoppingItemPurchased(
          createShoppingPublishContext(eventBus, params.id, callerUserId, request.id),
          eventData,
        ).catch((error: unknown) => {
          app.log.error(error);
        });
      }
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.delete('/api/households/:id/shopping/lists/:listId/items/purchased', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          listId: z.string().min(1),
        })
        .parse(request.params);

      await requireMember(db, params.id, callerUserId, 'add_shopping_item');
      db.clearPurchasedItems(params.id, params.listId);
      reply.status(204).send();
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/captures/:captureId/status', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          captureId: z.string().min(1),
        })
        .parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      const status = db.getCaptureStatus(params.id, params.captureId);
      reply.status(200).send(HouseholdCaptureStatusResponseSchema.parse(status));
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.patch('/api/households/:id/config', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdUpdateConfigRequestSchema.parse(request.body);

      const household = db.getHousehold(params.id);
      if (!household) {
        reply.status(404).send({ error: 'Household not found' });
        return;
      }

      const member = db.getMember(params.id, callerUserId);
      if (!member || member.status !== 'active') {
        reply.status(403).send({ error: 'Forbidden' });
        return;
      }

      if (member.role !== 'Admin') {
        reply.status(403).send({ error: 'Insufficient role' });
        return;
      }

      db.updateHouseholdConfig(params.id, body);
      const config = HouseholdHomeStateConfigSchema.parse(db.getHouseholdConfig(params.id));

      reply.status(200).send({
        householdId: params.id,
        config,
      });
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/context', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      const summary = db.getHouseholdContextSummary(params.id);
      reply.status(200).send(HouseholdContextSummarySchema.parse(summary));
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/ha/webhook', async (request, reply) => {
    try {
      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const sharedWebhookSecret = process.env.LIFEOS_HA_WEBHOOK_SECRET?.trim() ?? '';

      if (!sharedWebhookSecret) {
        reply.status(503).send({ error: 'HA webhook integration is not configured' });
        return;
      }

      const providedSecretHeader = request.headers['x-lifeos-ha-secret'];
      const providedSecret = Array.isArray(providedSecretHeader)
        ? providedSecretHeader[0]
        : providedSecretHeader;

      if (!validateWebhookSecret(sharedWebhookSecret, providedSecret)) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const household = db.getHousehold(params.id);
      if (!household) {
        reply.status(404).send({ error: 'Household not found' });
        return;
      }

      const body = HouseholdHaWebhookRequestSchema.parse(request.body);
      const homeStateConfig = parseHouseholdHomeStateConfig(household.config_json);

      if (!homeStateConfig.haIntegrationEnabled) {
        reply.status(403).send({ error: 'HA integration is disabled for this household' });
        return;
      }

      if (!isStateKeyConsented(homeStateConfig.haConsentedStateKeys, body.stateKey)) {
        reply.status(403).send({ error: 'State key is not consented' });
        return;
      }

      db.appendHomeStateLog({
        householdId: params.id,
        deviceId: body.deviceId,
        stateKey: body.stateKey,
        previousValue: body.previousValue,
        newValue: body.newValue,
        source: 'ha_bridge',
        consentVerified: true,
      });

      const homeStateEvent = HouseholdHomeStateChangedSchema.parse(
        buildHomeStateChangedEventData({
          householdId: params.id,
          deviceId: body.deviceId,
          stateKey: body.stateKey,
          previousValue: body.previousValue ?? null,
          newValue: body.newValue,
          consentVerified: true,
        }),
      );

      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdHomeStateChanged,
        homeStateEvent,
        params.id,
        'ha-bridge',
        request.id,
      );

      if (body.voice_transcript && body.voice_transcript.trim().length > 0) {
        const voiceEvent = HouseholdVoiceCaptureCreatedSchema.parse(
          buildHaVoiceCaptureEventData({
            householdId: params.id,
            transcript: body.voice_transcript,
            sourceDeviceId: body.sourceDeviceId ?? body.deviceId,
            ...(body.actorUserId === undefined ? {} : { actorUserId: body.actorUserId }),
            ...(body.targetHint === undefined ? {} : { targetHint: body.targetHint }),
          }),
        );

        await publishHouseholdEvent(
          eventBus,
          Topics.lifeos.householdVoiceCaptureCreated,
          voiceEvent,
          params.id,
          voiceEvent.actorUserId,
          request.id,
        );
      }

      reply.status(202).send({ accepted: true });
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/calendars', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      reply.status(200).send(db.listCalendars(params.id));
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/calendars', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          name: z.string().min(1),
          color: z.string().min(1),
        })
        .parse(request.body);

      await requireMember(db, params.id, callerUserId, 'view');
      const calendar = db.createCalendar(params.id, body.name, body.color);
      reply.status(201).send(calendar);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/calendars/:calendarId/events', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          calendarId: z.string().min(1),
        })
        .parse(request.params);
      const query = z
        .object({
          from: z.string().min(1).optional(),
          to: z.string().min(1).optional(),
        })
        .parse(request.query);
      const from = query.from ? normalizeCalendarRangeFilter(query.from, 'start') : undefined;
      const to = query.to ? normalizeCalendarRangeFilter(query.to, 'end') : undefined;

      await requireMember(db, params.id, callerUserId, 'view');
      const events = db.listEvents(params.id, params.calendarId, from, to).map((row) => ({
        id: row.id,
        title: row.title,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        recurrenceRule: row.recurrence_rule,
        reminderAt: row.reminder_at,
        attendeeUserIds: JSON.parse(row.attendee_user_ids_json) as string[],
        calendarColor: row.calendar_color,
      }));
      reply.status(200).send(events);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/calendars/:calendarId/events', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          calendarId: z.string().min(1),
        })
        .parse(request.params);
      const body = z
        .object({
          title: z.string().min(1),
          startAt: z.string().datetime(),
          endAt: z.string().datetime(),
          status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
          recurrenceRule: z.string().optional(),
          reminderAt: z.string().datetime().optional(),
          attendeeUserIds: z.array(z.string().min(1)),
        })
        .parse(request.body);

      await requireMember(db, params.id, callerUserId, 'view');
      const event = db.createEvent(
        params.calendarId,
        params.id,
        body.title,
        body.startAt,
        body.endAt,
        body.status,
        body.recurrenceRule ?? null,
        body.reminderAt ?? null,
        body.attendeeUserIds,
      );
      const calendar = db.getCalendar(params.id, params.calendarId);
      reply.status(201).send({
        id: event.id,
        title: event.title,
        startAt: event.start_at,
        endAt: event.end_at,
        status: event.status,
        recurrenceRule: event.recurrence_rule,
        reminderAt: event.reminder_at,
        attendeeUserIds: JSON.parse(event.attendee_user_ids_json) as string[],
        calendarColor: calendar?.color ?? '',
      });

      const eventData = HouseholdCalendarEventCreatedSchema.parse({
        householdId: params.id,
        calendarId: params.calendarId,
        eventId: event.id,
        title: event.title,
        startAt: event.start_at,
        endAt: event.end_at,
        recurrenceRule: event.recurrence_rule ?? undefined,
        reminderAt: event.reminder_at ?? undefined,
        attendeeUserIds: JSON.parse(event.attendee_user_ids_json) as string[],
      });
      void publishCalendarEventCreated(
        createCalendarPublishContext(eventBus, params.id, callerUserId, request.id),
        eventData,
      ).catch((error: unknown) => {
        app.log.error(error);
      });
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.patch('/api/households/:id/calendars/:calendarId/events/:eventId', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          calendarId: z.string().min(1),
          eventId: z.string().min(1),
        })
        .parse(request.params);
      const body = z
        .object({
          title: z.string().min(1).optional(),
          startAt: z.string().datetime().optional(),
          endAt: z.string().datetime().optional(),
          status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
        })
        .parse(request.body);
      const update = {
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.startAt === undefined ? {} : { startAt: body.startAt }),
        ...(body.endAt === undefined ? {} : { endAt: body.endAt }),
        ...(body.status === undefined ? {} : { status: body.status }),
      };

      await requireMember(db, params.id, callerUserId, 'view');
      const event = db.updateEvent(params.id, params.calendarId, params.eventId, update);
      const calendar = db.getCalendar(params.id, params.calendarId);
      reply.status(200).send({
        id: event.id,
        title: event.title,
        startAt: event.start_at,
        endAt: event.end_at,
        status: event.status,
        recurrenceRule: event.recurrence_rule,
        reminderAt: event.reminder_at,
        attendeeUserIds: JSON.parse(event.attendee_user_ids_json) as string[],
        calendarColor: calendar?.color ?? '',
      });
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/calendars/:calendarId/events.ics', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          calendarId: z.string().min(1),
        })
        .parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      const events = db.listEvents(params.id, params.calendarId);
      const ics = generateIcs(events);
      reply.header('Content-Type', 'text/calendar').status(200).send(ics);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/chores', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdCreateChoreRequestSchema.parse(request.body);

      await requireMember(db, params.id, callerUserId, 'complete_chore');
      const chore = db.createChore(
        params.id,
        body.title,
        body.assignedToUserId,
        body.dueAt,
        body.recurrenceRule,
      );

      const reminder = db.createReminder(
        params.id,
        'chore',
        chore.id,
        [chore.assigned_to_user_id],
        chore.due_at,
      );
      await publishReminderFailureEvents(db, eventBus, {
        householdId: params.id,
        reminderId: reminder.id,
        objectType: 'chore',
        objectId: chore.id,
        targetUserIds: [chore.assigned_to_user_id],
        remindAt: chore.due_at,
      });

      const eventData = HouseholdChoreAssignedSchema.parse({
        householdId: params.id,
        choreId: chore.id,
        choreTitle: chore.title,
        assignedToUserId: chore.assigned_to_user_id,
        dueAt: chore.due_at,
        recurrenceRule: chore.recurrence_rule ?? undefined,
      });
      await publishChoreAssigned(
        createChorePublishContext(eventBus, params.id, callerUserId, request.id),
        eventData,
      );

      reply.status(201).send(chore);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/chores', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      const chores = db.listChores(params.id);
      reply.status(200).send(chores);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.get('/api/households/:id/chores/:choreId/history', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          choreId: z.string().min(1),
        })
        .parse(request.params);

      await requireMember(db, params.id, callerUserId, 'view');
      const history = db.getChoreHistory(params.id, params.choreId);
      reply.status(200).send(history);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/chores/:choreId/assign', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          choreId: z.string().min(1),
        })
        .parse(request.params);
      const body = z.object({ userId: z.string().min(1) }).parse(request.body);

      await requireMember(db, params.id, callerUserId, 'complete_chore');

      const assignment = db.assignChore(params.id, params.choreId, body.userId, callerUserId);
      const chore = db.getChore(params.id, params.choreId);
      if (!chore) {
        throw makeStatusError(404, 'Chore not found');
      }

      const reminder = db.createReminder(
        params.id,
        'chore',
        params.choreId,
        [body.userId],
        assignment.due_at,
      );
      await publishReminderFailureEvents(db, eventBus, {
        householdId: params.id,
        reminderId: reminder.id,
        objectType: 'chore',
        objectId: params.choreId,
        targetUserIds: [body.userId],
        remindAt: assignment.due_at,
      });

      const eventData = HouseholdChoreAssignedSchema.parse({
        householdId: params.id,
        choreId: params.choreId,
        choreTitle: chore.title,
        assignedToUserId: body.userId,
        dueAt: assignment.due_at,
        recurrenceRule: chore.recurrence_rule ?? undefined,
      });
      await publishChoreAssigned(
        createChorePublishContext(eventBus, params.id, callerUserId, request.id),
        eventData,
      );

      reply.status(200).send(assignment);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.patch('/api/households/:id/chores/:choreId/complete', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z
        .object({
          id: z.string().min(1),
          choreId: z.string().min(1),
        })
        .parse(request.params);

      await requireMember(db, params.id, callerUserId, 'complete_chore');

      const callerMember = db.getMember(params.id, callerUserId);
      if (!callerMember || callerMember.status !== 'active') {
        throw makeStatusError(403, 'Forbidden');
      }

      const choreBeforeCompletion = db.getChore(params.id, params.choreId);
      if (!choreBeforeCompletion) {
        throw makeStatusError(404, 'Chore not found');
      }

      if (callerMember.role !== 'Admin' && choreBeforeCompletion.assigned_to_user_id !== callerUserId) {
        throw makeStatusError(403, 'Only assigned member or Admin can complete chore');
      }

      let chore;
      try {
        chore = db.completeChore(params.id, params.choreId, callerUserId);
      } catch (error) {
        const failure = resolveChoreAutomationFailure(error, {
          choreTitle: choreBeforeCompletion.title,
          recurrenceRule: choreBeforeCompletion.recurrence_rule,
        });
        if (failure) {
          const observability = createObservabilityClient({
            serviceName: 'dashboard-service',
            environment: process.env.LIFEOS_PROFILE?.trim() || process.env.NODE_ENV || 'development',
          });
          const span = emitAutomationFailureSpan(observability, 'household.chore.run', {
            householdId: params.id,
            actorId: callerUserId,
            actionType: 'household.chore.run',
            errorCode: failure.errorCode,
            fixSuggestion: failure.fixSuggestion,
            objectId: params.choreId,
            objectRef: `chore:${params.choreId}`,
            details: {
              chore_title: choreBeforeCompletion.title,
            },
          });
          await publishAutomationFailure(
            eventBus,
            HouseholdAutomationFailedSchema.parse({
              household_id: params.id,
              actor_id: callerUserId,
              action_type: 'household.chore.run',
              error_code: failure.errorCode,
              fix_suggestion: failure.fixSuggestion,
              span_id: span.spanId,
              trace_id: span.traceId,
              object_id: params.choreId,
              object_ref: `chore:${params.choreId}`,
              details: {
                chore_title: choreBeforeCompletion.title,
              },
            }),
          );
        }
        throw error;
      }

      const eventData = HouseholdChoreCompletedSchema.parse({
        householdId: params.id,
        choreId: chore.id,
        choreTitle: chore.title,
        completedByUserId: callerUserId,
        completedAt: chore.completed_at ?? new Date().toISOString(),
        streakCount: chore.streakCount,
      });
      await publishChoreCompleted(
        createChorePublishContext(eventBus, params.id, callerUserId, request.id),
        eventData,
      );

      reply.status(200).send(chore);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/reminders', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdCreateReminderRequestSchema.parse(request.body);
      const objectType = ReminderObjectTypeSchema.parse(body.objectType);

      await requireMember(db, params.id, callerUserId, 'add_shopping_item');
      const reminder = db.createReminder(
        params.id,
        objectType,
        body.objectId,
        body.targetUserIds,
        body.remindAt,
      );
      await publishReminderFailureEvents(db, eventBus, {
        householdId: params.id,
        reminderId: reminder.id,
        objectType,
        objectId: body.objectId,
        targetUserIds: body.targetUserIds,
        remindAt: body.remindAt,
      });
      reply.status(201).send(reminder);
    } catch (error) {
      replyError(reply, error);
    }
  });

  app.post('/api/households/:id/notes', async (request, reply) => {
    try {
      const callerUserId = await extractCallerUserId(request);
      if (!callerUserId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = HouseholdCreateNoteRequestSchema.parse(request.body);

      await requireMember(db, params.id, callerUserId, 'add_shopping_item');
      const note = db.createNote(params.id, callerUserId, body.body);
      reply.status(201).send(note);
    } catch (error) {
      replyError(reply, error);
    }
  });
}
