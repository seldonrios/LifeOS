import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics } from '@lifeos/event-bus';

import { IntentRouter } from './intent-router';

test('task intent creates a plan and emits task-scheduled events', async () => {
  const publishCalls: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const createNodeCalls: Array<Record<string, unknown>> = [];

  const router = new IntentRouter({
    client: {
      async createNode(_label: string, data: Record<string, unknown>) {
        createNodeCalls.push(data);
        return String(data.id);
      },
    } as never,
    publish: async (topic, data) => {
      publishCalls.push({ topic, data });
    },
    now: () => new Date('2026-03-22T15:00:00.000Z'),
  });

  const outcome = await router.handleCommand('add a task to buy milk');

  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'task_added');
  assert.equal(createNodeCalls.length, 1);
  assert.match(String(createNodeCalls[0]?.title), /Voice task:/);
  assert.equal(publishCalls[0]?.topic, Topics.plan.created);
  assert.equal(publishCalls[1]?.topic, Topics.task.scheduled);
  assert.equal(publishCalls[2]?.topic, Topics.lifeos.voiceCommandProcessed);
});

test('next-actions intent returns the top next action', async () => {
  const router = new IntentRouter({
    client: {
      async generateReview() {
        return {
          period: 'daily',
          wins: [],
          nextActions: ['Board Meeting Prep: Draft board deck'],
          generatedAt: '2026-03-22T15:00:00.000Z',
          source: 'heuristic',
        };
      },
    } as never,
  });

  const outcome = await router.handleCommand("what's next");
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'next_actions');
  assert.match(outcome.responseText, /Draft board deck/);
});

test('unknown intent publishes unhandled event', async () => {
  const publishCalls: string[] = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic) => {
      publishCalls.push(topic);
    },
  });

  const outcome = await router.handleCommand('open the pod bay doors');
  assert.equal(outcome.handled, false);
  assert.equal(outcome.action, 'unhandled');
  assert.deepEqual(publishCalls, [Topics.lifeos.voiceCommandUnhandled]);
});

test('time intent responds with current timestamp', async () => {
  const publishCalls: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic, data) => {
      publishCalls.push({ topic, data });
    },
    now: () => new Date('2026-03-23T13:45:00.000Z'),
  });

  const outcome = await router.handleCommand('Hey LifeOS what time is it');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'time_reported');
  assert.match(outcome.responseText, /2026-03-23T13:45:00.000Z/);
  assert.equal(publishCalls[0]?.topic, Topics.lifeos.voiceCommandProcessed);
});

test('calendar-style intent publishes agent work request', async () => {
  const publishCalls: string[] = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic) => {
      publishCalls.push(topic);
    },
    now: () => new Date('2026-03-23T13:45:00.000Z'),
  });

  const outcome = await router.handleCommand('check my calendar for tomorrow');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'agent_work_requested');
  assert.deepEqual(publishCalls, [Topics.agent.workRequested, Topics.lifeos.voiceCommandProcessed]);
});
