import assert from 'node:assert/strict';
import test from 'node:test';

import type { GoalPlan } from '@lifeos/life-graph';

import { interpretGoal, type OllamaChatClient, type OllamaChatRequest } from './interpreter';

function sampleGoalPlan(): GoalPlan {
  return {
    id: 'goal_123',
    title: 'Board Meeting Prep',
    description: 'Prepare board deck and notes',
    deadline: '2026-03-26',
    createdAt: '2026-03-21T12:00:00.000Z',
    tasks: [
      {
        id: 'task_1',
        title: 'Draft board deck',
        status: 'todo',
        priority: 4,
        dueDate: '2026-03-24',
      },
    ],
  };
}

test('interpretGoal uses chat json mode and low temperature', async () => {
  const requests: OllamaChatRequest[] = [];
  const client: OllamaChatClient = {
    async chat(request) {
      requests.push(request);
      return {
        message: {
          content: JSON.stringify(sampleGoalPlan()),
        },
      };
    },
  };

  const result = await interpretGoal('Prepare for board meeting', {
    model: 'llama3.1:8b',
    now: new Date('2026-03-21T12:00:00.000Z'),
    client,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.format, 'json');
  assert.equal(requests[0]?.options?.temperature, 0.2);
  assert.match(requests[0]?.messages[0]?.content ?? '', /Exact schema:/);
  assert.match(requests[0]?.messages[0]?.content ?? '', /\"title\"/);
  assert.equal(result.title, 'Board Meeting Prep');
});

test('interpretGoal retries up to 3 attempts and succeeds on final repair attempt', async () => {
  const requests: OllamaChatRequest[] = [];
  let callCount = 0;
  const client: OllamaChatClient = {
    async chat(request) {
      requests.push(request);
      callCount += 1;
      if (callCount < 3) {
        return { message: { content: 'not-json' } };
      }

      return { message: { content: JSON.stringify(sampleGoalPlan()) } };
    },
  };

  const stages: string[] = [];
  const result = await interpretGoal('Prepare for board meeting', {
    client,
    onStage: (stage) => {
      stages.push(stage);
    },
  });

  assert.equal(result.tasks.length, 1);
  assert.equal(requests.length, 3);
  assert.match(requests[1]?.messages[1]?.content ?? '', /previous output failed validation/i);
  assert.match(requests[2]?.messages[1]?.content ?? '', /previous output failed validation/i);
  assert.ok(stages.includes('repair_prompt_built'));
  assert.ok(stages.includes('repair_parse_succeeded'));
});

test('interpretGoal throws after max retries', async () => {
  const client: OllamaChatClient = {
    async chat() {
      return { message: { content: 'still not-json' } };
    },
  };

  await assert.rejects(
    () => interpretGoal('Prepare for board meeting', { client }),
    /failed after 3 attempts/i,
  );
});

test('interpretGoal ignores model-provided ids/timestamps and drops past deadlines', async () => {
  const now = new Date('2026-03-22T12:00:00.000Z');
  const client: OllamaChatClient = {
    async chat() {
      return {
        message: {
          content: JSON.stringify({
            id: '12345',
            title: 'Prepare Taxes',
            description: 'Plan generated from goal: Prepare taxes by end of month',
            createdAt: '2024-02-08T14:30:00.000Z',
            deadline: '2024-02-28',
            tasks: [
              {
                id: 'task_static',
                title: 'Gather tax documents',
                status: 'todo',
                priority: 5,
                dueDate: '2024-02-20',
              },
            ],
          }),
        },
      };
    },
  };

  const result = await interpretGoal('Prepare taxes by end of month', {
    now,
    client,
  });

  assert.notEqual(result.id, '12345');
  assert.equal(result.createdAt, now.toISOString());
  assert.equal(result.deadline, null);
  assert.notEqual(result.tasks[0]?.id, 'task_static');
  assert.equal(result.tasks[0]?.dueDate, undefined);
});
