import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AuditLogEntrySchema,
  ChoreStatusSchema,
  CaptureResultSchema,
  HouseholdCalendarEventCreatedSchema,
  HouseholdCaptureUnresolvedSchema,
  HouseholdChoreCreateRequestedSchema,
  HouseholdChoreAssignedSchema,
  HouseholdChoreCompletedSchema,
  HouseholdHomeStateChangedSchema,
  HouseholdMemberInvitedSchema,
  HouseholdMemberJoinedSchema,
  HouseholdMemberRoleChangedSchema,
  HouseholdNoteCreateRequestedSchema,
  HouseholdReminderCreateRequestedSchema,
  HouseholdMemberStatusSchema,
  HouseholdReminderFiredSchema,
  HouseholdRoleSchema,
  HouseholdShoppingItemAddRequestedSchema,
  HouseholdShoppingItemAddedSchema,
  HouseholdShoppingItemPurchasedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  HeroLoopEventSchema,
  PlanSchema,
  ReminderSchema,
  ReviewReportSchema,
  ShoppingItemStatusSchema,
  Topics,
} from './index';

test('hero-loop contract schemas parse valid payloads', () => {
  const parsedPlan = PlanSchema.parse({
    id: 'plan_weekly_focus',
    title: 'Weekly focus plan',
    description: 'Ship the mobile approval flow and clean up backlog tasks.',
    createdAt: '2026-03-28T12:00:00.000Z',
    deadline: '2026-04-02',
    priority: 'high',
    tasks: [
      {
        id: 'task_capture',
        title: 'Capture open requests from team chat',
        status: 'todo',
        priority: 3,
        dueDate: '2026-03-29',
      },
    ],
  });
  assert.equal(parsedPlan.tasks.length, 1);

  const parsedReminder = ReminderSchema.parse({
    id: 'reminder_task_capture',
    title: 'Follow up on captured requests',
    dueAt: '2026-03-29T16:00:00.000Z',
    channel: 'inbox',
    status: 'scheduled',
    taskId: 'task_capture',
  });
  assert.equal(parsedReminder.channel, 'inbox');

  const parsedReview = ReviewReportSchema.parse({
    period: 'daily',
    wins: ['Inbox triaged before noon'],
    nextActions: ['Close the highest-priority approval'],
    loopSummary: {
      pendingCaptures: 1,
      actionsDueToday: 2,
      unacknowledgedReminders: 0,
      completedActions: ['Close the highest-priority approval (action_1)'],
    },
    generatedAt: '2026-03-28T22:00:00.000Z',
    source: 'heuristic',
  });
  assert.equal(parsedReview.period, 'daily');
  assert.equal(parsedReview.loopSummary.completedActions.length, 1);

  const parsedCaptureResult = CaptureResultSchema.parse({
    id: 'capture_001',
    type: 'text',
    content: 'Need to confirm launch checklist ownership',
    processedAt: Date.now(),
    status: 'success',
  });
  assert.equal(parsedCaptureResult.type, 'text');
});

test('hero-loop event envelope validates event type and payload pairing', () => {
  const parsed = HeroLoopEventSchema.parse({
    type: 'lifeos.review.generated',
    timestamp: '2026-03-28T22:00:00.000Z',
    payload: {
      period: 'weekly',
      wins: ['Shipped baseline approvals flow'],
      nextActions: ['Document mobile notification edge cases'],
      loopSummary: {
        pendingCaptures: 2,
        actionsDueToday: 3,
        unacknowledgedReminders: 1,
        completedActions: ['Shipped baseline approvals flow (action_7)'],
        suggestedNextActions: ['Follow up on overdue mobile QA'],
      },
      generatedAt: '2026-03-28T22:00:00.000Z',
      source: 'llm',
    },
  });

  assert.equal(parsed.type, 'lifeos.review.generated');
  assert.equal(parsed.payload.source, 'llm');
  assert.equal(parsed.payload.loopSummary.suggestedNextActions?.length, 1);
});

test('reminder schema rejects unsupported status values', () => {
  assert.throws(
    () =>
      ReminderSchema.parse({
        id: 'reminder_bad',
        title: 'Invalid reminder',
        dueAt: '2026-03-29T16:00:00.000Z',
        channel: 'inbox',
        status: 'queued',
      }),
    /Invalid option/,
  );
});

test('contracts package exports Topics for acceptance import usage', () => {
  assert.equal(Topics.lifeos.householdMemberInvited, 'lifeos.household.member.invited');
});

test('household enum schemas parse valid values and reject omitted values', () => {
  assert.equal(HouseholdRoleSchema.parse('Admin'), 'Admin');
  assert.throws(() => HouseholdRoleSchema.parse(undefined));

  assert.equal(HouseholdMemberStatusSchema.parse('active'), 'active');
  assert.throws(() => HouseholdMemberStatusSchema.parse(undefined));

  assert.equal(ChoreStatusSchema.parse('pending'), 'pending');
  assert.throws(() => ChoreStatusSchema.parse(undefined));

  assert.equal(ShoppingItemStatusSchema.parse('added'), 'added');
  assert.throws(() => ShoppingItemStatusSchema.parse(undefined));
});

test('household object schemas parse valid payloads and reject missing required fields', () => {
  const schemaCases = [
    {
      schema: HouseholdMemberInvitedSchema,
      valid: {
        householdId: 'house_1',
        invitedUserId: 'user_2',
        role: 'Adult',
        inviteToken: 'invite_token_1',
        expiresAt: '2026-03-31T10:00:00.000Z',
      },
      missingField: 'householdId',
    },
    {
      schema: HouseholdMemberJoinedSchema,
      valid: {
        householdId: 'house_1',
        userId: 'user_1',
        role: 'Teen',
        joinedAt: '2026-03-30T08:00:00.000Z',
      },
      missingField: 'userId',
    },
    {
      schema: HouseholdMemberRoleChangedSchema,
      valid: {
        householdId: 'house_1',
        userId: 'user_1',
        previousRole: 'Teen',
        newRole: 'Adult',
      },
      missingField: 'newRole',
    },
    {
      schema: HouseholdChoreAssignedSchema,
      valid: {
        householdId: 'house_1',
        choreId: 'chore_1',
        choreTitle: 'Take out trash',
        assignedToUserId: 'user_2',
        dueAt: '2026-03-30T19:00:00.000Z',
        recurrenceRule: '',
      },
      missingField: 'choreTitle',
    },
    {
      schema: HouseholdChoreCompletedSchema,
      valid: {
        householdId: 'house_1',
        choreId: 'chore_1',
        choreTitle: 'Take out trash',
        completedByUserId: 'user_2',
        completedAt: '2026-03-30T19:10:00.000Z',
        streakCount: 4,
      },
      missingField: 'completedAt',
    },
    {
      schema: HouseholdShoppingItemAddedSchema,
      valid: {
        householdId: 'house_1',
        listId: 'list_1',
        itemId: 'item_1',
        title: 'Milk',
        addedByUserId: 'user_1',
        source: 'manual',
      },
      missingField: 'title',
    },
    {
      schema: HouseholdShoppingItemPurchasedSchema,
      valid: {
        householdId: 'house_1',
        listId: 'list_1',
        itemId: 'item_1',
        title: 'Milk',
        purchasedByUserId: 'user_1',
        purchasedAt: '2026-03-30T20:00:00.000Z',
      },
      missingField: 'purchasedByUserId',
    },
    {
      schema: HouseholdCalendarEventCreatedSchema,
      valid: {
        householdId: 'house_1',
        calendarId: 'cal_1',
        eventId: 'event_1',
        title: 'Family Dinner',
        startAt: '2026-04-01T18:00:00.000Z',
        endAt: '2026-04-01T19:00:00.000Z',
        recurrenceRule: '',
        attendeeUserIds: ['user_1', 'user_2'],
      },
      missingField: 'attendeeUserIds',
    },
    {
      schema: HouseholdVoiceCaptureCreatedSchema,
      valid: {
        captureId: 'cap_1',
        householdId: 'house_1',
        actorUserId: 'user_1',
        text: 'Add apples to shopping list',
        audioRef: null,
        source: 'mobile',
        createdAt: '2026-03-30T21:00:00.000Z',
      },
      missingField: 'text',
    },
    {
      schema: HouseholdShoppingItemAddRequestedSchema,
      valid: {
        householdId: 'house_1',
        actorUserId: 'user_1',
        originalCaptureId: 'cap_1',
        text: 'add oat milk to the shopping list',
        itemTitle: 'oat milk',
      },
      missingField: 'itemTitle',
    },
    {
      schema: HouseholdChoreCreateRequestedSchema,
      valid: {
        householdId: 'house_1',
        actorUserId: 'user_1',
        originalCaptureId: 'cap_2',
        text: 'someone needs to vacuum the living room',
        choreTitle: 'vacuum the living room',
      },
      missingField: 'choreTitle',
    },
    {
      schema: HouseholdReminderCreateRequestedSchema,
      valid: {
        householdId: 'house_1',
        actorUserId: 'user_1',
        originalCaptureId: 'cap_3',
        text: 'remind us to call the plumber tomorrow',
        reminderText: 'call the plumber tomorrow',
      },
      missingField: 'reminderText',
    },
    {
      schema: HouseholdNoteCreateRequestedSchema,
      valid: {
        householdId: 'house_1',
        actorUserId: 'user_1',
        originalCaptureId: 'cap_4',
        text: 'note that the wifi password is LifeOS2026',
        noteBody: 'the wifi password is LifeOS2026',
      },
      missingField: 'noteBody',
    },
    {
      schema: HouseholdCaptureUnresolvedSchema,
      valid: {
        captureId: 'cap_2',
        householdId: 'house_1',
        text: 'Remember the thing',
        reason: 'no_target',
      },
      missingField: 'reason',
    },
    {
      schema: HouseholdHomeStateChangedSchema,
      valid: {
        householdId: 'house_1',
        deviceId: 'device_1',
        stateKey: 'light.kitchen',
        previousValue: { state: 'off' },
        newValue: { state: 'on' },
        source: 'ha_bridge',
        consentVerified: true,
      },
      missingField: 'stateKey',
    },
    {
      schema: HouseholdReminderFiredSchema,
      valid: {
        householdId: 'house_1',
        reminderId: 'rem_1',
        objectType: 'chore',
        objectId: 'chore_1',
        targetUserIds: ['user_2'],
        firedAt: '2026-03-30T22:00:00.000Z',
        deliveryStatus: 'delivered',
      },
      missingField: 'deliveryStatus',
    },
    {
      schema: AuditLogEntrySchema,
      valid: {
        id: 'audit_1',
        householdId: 'house_1',
        actorId: 'user_1',
        actionType: 'chore.complete',
        objectRef: 'chore_1',
        payloadJson: { streakCount: 4 },
        createdAt: '2026-03-30T22:10:00.000Z',
      },
      missingField: 'createdAt',
    },
  ] as const;

  for (const schemaCase of schemaCases) {
    const parsed = schemaCase.schema.parse(schemaCase.valid);
    assert.ok(parsed);

    const invalid = { ...schemaCase.valid } as Record<string, unknown>;
    delete invalid[schemaCase.missingField];
    assert.throws(() => schemaCase.schema.parse(invalid));
  }
});
