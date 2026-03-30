import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
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
  HouseholdShoppingItemAddedSchema,
  HouseholdShoppingItemPurchasedSchema,
  HouseholdUpdateShoppingItemStatusRequestSchema,
} from '@lifeos/contracts';
import { type BaseEvent, type ManagedEventBus, Topics } from '@lifeos/event-bus';
import {
  HouseholdGraphClient,
  InvalidShoppingItemTransitionError,
  canPerform,
  generateInviteExpiry,
  generateInviteToken,
} from '@lifeos/household-identity-module';
import { z } from 'zod';

import { extractCallerUserId } from '../auth';

type StatusSentinel = {
  status: number;
  message?: string;
};

function makeStatusError(status: number, message?: string): StatusSentinel {
  return { status, message };
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
    reply.status(400).send({ error: error.message });
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
      const item = db.addShoppingItem(params.id, body.title, callerUserId, body.source);

      const eventData = HouseholdShoppingItemAddedSchema.parse({
        householdId: params.id,
        listId: item.list_id,
        itemId: item.id,
        title: item.title,
        addedByUserId: callerUserId,
        source: item.source,
      });
      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdShoppingItemAdded,
        eventData,
        params.id,
        callerUserId,
        request.id,
      );

      reply.status(201).send(item);
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

      if (body.status === 'purchased') {
        const eventData = HouseholdShoppingItemPurchasedSchema.parse({
          householdId: params.id,
          listId: item.list_id,
          itemId: item.id,
          title: item.title,
          purchasedByUserId: callerUserId,
          purchasedAt: new Date().toISOString(),
        });
        await publishHouseholdEvent(
          eventBus,
          Topics.lifeos.householdShoppingItemPurchased,
          eventData,
          params.id,
          callerUserId,
          request.id,
        );
      }

      reply.status(200).send(item);
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

      const eventData = HouseholdChoreAssignedSchema.parse({
        householdId: params.id,
        choreId: chore.id,
        choreTitle: chore.title,
        assignedToUserId: chore.assigned_to_user_id,
        dueAt: chore.due_at,
        recurrenceRule: chore.recurrence_rule ?? undefined,
      });
      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdChoreAssigned,
        eventData,
        params.id,
        callerUserId,
        request.id,
      );

      reply.status(201).send(chore);
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
      const chore = db.completeChore(params.id, params.choreId, callerUserId);

      const eventData = HouseholdChoreCompletedSchema.parse({
        householdId: params.id,
        choreId: chore.id,
        choreTitle: chore.title,
        completedByUserId: callerUserId,
        completedAt: chore.completed_at ?? new Date().toISOString(),
        streakCount: 0,
      });
      await publishHouseholdEvent(
        eventBus,
        Topics.lifeos.householdChoreCompleted,
        eventData,
        params.id,
        callerUserId,
        request.id,
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

      await requireMember(db, params.id, callerUserId, 'add_shopping_item');
      const reminder = db.createReminder(
        params.id,
        body.objectType,
        body.objectId,
        body.targetUserIds,
        body.remindAt,
      );
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
