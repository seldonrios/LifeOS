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
    classifyIntent: async () => ({
      intent: 'task_add',
      payload: { title: 'Buy milk' },
    }),
  });

  const outcome = await router.handleCommand('add a task to buy milk');

  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'task_added');
  assert.equal(createNodeCalls.length, 1);
  assert.match(String(createNodeCalls[0]?.title), /Voice task:/);
  const firstTask = (
    createNodeCalls[0]?.tasks as Array<{ voiceTriggered?: boolean }> | undefined
  )?.[0];
  assert.equal(firstTask?.voiceTriggered, true);
  assert.equal(publishCalls[0]?.topic, Topics.plan.created);
  assert.equal(publishCalls[1]?.topic, Topics.task.scheduled);
  assert.equal(publishCalls[2]?.topic, Topics.lifeos.voiceCommandProcessed);
  assert.equal(publishCalls[3]?.topic, Topics.lifeos.voiceIntentTaskAdd);
});

test('task intent forwards dueDate to scheduler intent payload', async () => {
  const publishCalls: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const router = new IntentRouter({
    client: {
      async createNode() {
        return 'goal_1';
      },
    } as never,
    publish: async (topic, data) => {
      publishCalls.push({ topic, data });
    },
    classifyIntent: async () => ({
      intent: 'task_add',
      payload: { title: 'Finish taxes', dueDate: '2026-04-15' },
    }),
  });

  const outcome = await router.handleCommand('add a task to finish taxes by 2026-04-15');
  assert.equal(outcome.handled, true);
  const taskIntent = publishCalls.find((entry) => entry.topic === Topics.lifeos.voiceIntentTaskAdd);
  assert.equal(taskIntent?.data.dueDate, '2026-04-15');
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
    classifyIntent: async () => ({
      intent: 'next_actions',
      payload: {},
    }),
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
    classifyIntent: async () => ({
      intent: 'unknown',
      payload: {},
    }),
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
    classifyIntent: async () => ({
      intent: 'question_time',
      payload: {},
    }),
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
    classifyIntent: async () => ({
      intent: 'calendar_add',
      payload: {
        date: '2026-03-24',
      },
    }),
  });

  const outcome = await router.handleCommand('check my calendar for tomorrow');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'agent_work_requested');
  assert.deepEqual(publishCalls, [
    Topics.lifeos.voiceIntentCalendarAdd,
    Topics.agent.workRequested,
    Topics.lifeos.voiceCommandProcessed,
  ]);
});

test('research intent publishes dedicated research topic before agent work request', async () => {
  const publishCalls: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic, data) => {
      publishCalls.push({ topic, data });
    },
    classifyIntent: async () => ({
      intent: 'research',
      payload: { query: 'quantum error correction' },
    }),
  });

  const outcome = await router.handleCommand('research quantum error correction');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'agent_work_requested');
  assert.deepEqual(
    publishCalls.map((entry) => entry.topic),
    [
      Topics.lifeos.voiceIntentResearch,
      Topics.agent.workRequested,
      Topics.lifeos.voiceCommandProcessed,
    ],
  );
  assert.equal(publishCalls[0]?.data.query, 'quantum error correction');
});

test('note intent publishes normalized note payload', async () => {
  const publishCalls: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic, data) => {
      publishCalls.push({ topic, data });
    },
    classifyIntent: async () => ({
      intent: 'note_add',
      payload: {
        content: 'the team prefers async updates',
        tags: ['team', 'workflow'],
      },
    }),
  });

  const outcome = await router.handleCommand('note that the team prefers async updates');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'agent_work_requested');
  const notePayload = publishCalls.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNoteAdd,
  )?.data;
  assert.ok(notePayload);
  assert.match(String(notePayload?.title), /team prefers async/i);
  assert.equal(notePayload?.content, 'the team prefers async updates');
});

test('news intent publishes dedicated news topic', async () => {
  const publishCalls: string[] = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic) => {
      publishCalls.push(topic);
    },
    classifyIntent: async () => ({
      intent: 'news',
      payload: { topic: 'tech' },
    }),
  });

  const outcome = await router.handleCommand('top tech news');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'agent_work_requested');
  assert.deepEqual(publishCalls, [
    Topics.lifeos.voiceIntentNews,
    Topics.agent.workRequested,
    Topics.lifeos.voiceCommandProcessed,
  ]);
});

test('note search intent publishes dedicated note search topic', async () => {
  const publishCalls: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic, data) => {
      publishCalls.push({ topic, data });
    },
    classifyIntent: async () => ({
      intent: 'note_search',
      payload: { query: 'team updates', sinceDays: 7 },
    }),
  });

  const outcome = await router.handleCommand('what did I note about team updates last week');
  assert.equal(outcome.handled, true);
  const searchEvent = publishCalls.find(
    (entry) => entry.topic === Topics.lifeos.voiceIntentNoteSearch,
  );
  assert.ok(searchEvent);
  assert.equal(searchEvent?.data.query, 'team updates');
  assert.equal(searchEvent?.data.sinceDays, 7);
});

test('research follow-up phrases fall back to research intent when classifier fails', async () => {
  const publishCalls: string[] = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic) => {
      publishCalls.push(topic);
    },
    classifyIntent: async () => {
      throw new Error('classifier unavailable');
    },
  });

  const outcome = await router.handleCommand('tell me more');
  assert.equal(outcome.handled, true);
  assert.deepEqual(publishCalls, [
    Topics.lifeos.voiceIntentResearch,
    Topics.agent.workRequested,
    Topics.lifeos.voiceCommandProcessed,
  ]);
});

test('research follow-up variant "what about" falls back to research intent', async () => {
  const publishCalls: string[] = [];
  const router = new IntentRouter({
    client: {} as never,
    publish: async (topic) => {
      publishCalls.push(topic);
    },
    classifyIntent: async () => {
      throw new Error('classifier unavailable');
    },
  });

  const outcome = await router.handleCommand('what about the grok timeline');
  assert.equal(outcome.handled, true);
  assert.deepEqual(publishCalls, [
    Topics.lifeos.voiceIntentResearch,
    Topics.agent.workRequested,
    Topics.lifeos.voiceCommandProcessed,
  ]);
});

test('classifier failures fall back to heuristic task parsing', async () => {
  const createNodeCalls: Array<Record<string, unknown>> = [];
  const router = new IntentRouter({
    client: {
      async createNode(_label: string, data: Record<string, unknown>) {
        createNodeCalls.push(data);
        return String(data.id);
      },
    } as never,
    classifyIntent: async () => {
      throw new Error('local model unavailable');
    },
  });

  const outcome = await router.handleCommand('add a task to buy milk');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'task_added');
  assert.equal(createNodeCalls.length, 1);
});

test('event publish failures do not fail task creation', async () => {
  const createNodeCalls: Array<Record<string, unknown>> = [];
  const router = new IntentRouter({
    client: {
      async createNode(_label: string, data: Record<string, unknown>) {
        createNodeCalls.push(data);
        return String(data.id);
      },
    } as never,
    publish: async () => {
      throw new Error('event bus offline');
    },
    classifyIntent: async () => ({
      intent: 'task_add',
      payload: { title: 'Buy milk' },
    }),
  });

  const outcome = await router.handleCommand('add a task to buy milk');
  assert.equal(outcome.handled, true);
  assert.equal(outcome.action, 'task_added');
  assert.equal(createNodeCalls.length, 1);
});

test('blank commands short-circuit to unhandled without classifying intent', async () => {
  let classifyCalls = 0;
  const router = new IntentRouter({
    client: {} as never,
    classifyIntent: async () => {
      classifyCalls += 1;
      return {
        intent: 'task_add',
        payload: {},
      };
    },
  });

  const outcome = await router.handleCommand('   ');
  assert.equal(outcome.handled, false);
  assert.equal(outcome.action, 'unhandled');
  assert.equal(classifyCalls, 0);
});

test('task payloads are trimmed to safe title and description lengths', async () => {
  const createNodeCalls: Array<Record<string, unknown>> = [];
  const longTitle = 'x'.repeat(400);
  const router = new IntentRouter({
    client: {
      async createNode(_label: string, data: Record<string, unknown>) {
        createNodeCalls.push(data);
        return String(data.id);
      },
    } as never,
    classifyIntent: async () => ({
      intent: 'task_add',
      payload: { title: longTitle },
    }),
  });

  const outcome = await router.handleCommand(`add a task to ${'y'.repeat(3000)}`);
  assert.equal(outcome.handled, true);
  assert.equal(createNodeCalls.length, 1);

  const created = createNodeCalls[0] ?? {};
  const taskList = created.tasks as Array<{ title?: string }>;
  assert.ok(taskList?.[0]?.title);
  assert.ok(String(taskList[0].title).length <= 160);
  assert.ok(String(created.description ?? '').length <= 1300);
});
