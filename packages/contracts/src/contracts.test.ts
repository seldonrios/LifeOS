import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CaptureResultSchema,
  HeroLoopEventSchema,
  PlanSchema,
  ReminderSchema,
  ReviewReportSchema,
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
    generatedAt: '2026-03-28T22:00:00.000Z',
    source: 'heuristic',
  });
  assert.equal(parsedReview.period, 'daily');

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
      generatedAt: '2026-03-28T22:00:00.000Z',
      source: 'llm',
    },
  });

  assert.equal(parsed.type, 'lifeos.review.generated');
  assert.equal(parsed.payload.source, 'llm');
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
