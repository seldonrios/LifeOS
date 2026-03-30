import type { FastifyInstance } from 'fastify';

import {
  HouseholdAddShoppingItemRequestSchema,
  HouseholdChangeMemberRoleRequestSchema,
  HouseholdCreateChoreRequestSchema,
  HouseholdCreateNoteRequestSchema,
  HouseholdCreateReminderRequestSchema,
  HouseholdCreateRequestSchema,
  HouseholdInviteMemberRequestSchema,
  HouseholdJoinRequestSchema,
  HouseholdUpdateShoppingItemStatusRequestSchema,
} from '@lifeos/contracts';
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

export function registerHouseholdRoutes(app: FastifyInstance, db: HouseholdGraphClient): void {
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
      const member = db.updateMemberRole(params.id, params.userId, body.role);
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
