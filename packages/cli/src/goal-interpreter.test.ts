import assert from 'node:assert/strict';
import test from 'node:test';

import type { GoalPlan } from '@lifeos/life-graph';

import { interpretGoal, type OllamaClient, type OllamaGenerateRequest } from './goal-interpreter';

function samplePlan(): GoalPlan {
  return {
    id: 'goal_123',
    title: 'Board Meeting Prep',
    description: 'Prepare deck and speaking notes.',
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

test('interpretGoal sends chat request with json format and low temperature', async () => {
  const capturedRequests: OllamaGenerateRequest[] = [];

  const client: OllamaClient = {
    async chat(request) {
      capturedRequests.push(request);
      return { message: { content: JSON.stringify(samplePlan()) } };
    },
  };

  const plan = await interpretGoal('Help me prepare for quarterly board meeting next Thursday', {
    model: 'llama3.1:8b',
    now: new Date('2026-03-21T12:00:00-04:00'),
    client,
  });

  assert.equal(capturedRequests[0]?.model, 'llama3.1:8b');
  assert.equal(capturedRequests[0]?.options?.temperature, 0.2);
  assert.equal(capturedRequests[0]?.format, 'json');
  assert.equal(plan.title, 'Board Meeting Prep');
});

test('interpretGoal retries with repair prompt after invalid output', async () => {
  const capturedRequests: OllamaGenerateRequest[] = [];
  const client: OllamaClient = {
    async chat(request) {
      capturedRequests.push(request);
      if (capturedRequests.length < 3) {
        return { message: { content: 'not valid json' } };
      }

      return {
        message: {
          content: JSON.stringify(samplePlan()),
        },
      };
    },
  };

  const plan = await interpretGoal('Prepare for board meeting', {
    model: 'llama3.1:8b',
    client,
  });

  assert.equal(plan.deadline, '2026-03-26');
  assert.equal(capturedRequests.length, 3);
  assert.match(
    capturedRequests[1]?.messages[1]?.content ?? '',
    /previous output failed validation/i,
  );
});

test('interpretGoal fails deterministically after max retries', async () => {
  const client: OllamaClient = {
    async chat() {
      return { message: { content: 'still not json' } };
    },
  };

  await assert.rejects(
    () =>
      interpretGoal('Prepare for board meeting', {
        model: 'llama3.1:8b',
        client,
      }),
    /failed after 3 attempts/i,
  );
});

test('interpretGoal emits safe stage callbacks including repair flow', async () => {
  const stages: string[] = [];
  let callCount = 0;
  const client: OllamaClient = {
    async chat() {
      callCount += 1;
      if (callCount < 3) {
        return { message: { content: 'bad-json' } };
      }

      return { message: { content: JSON.stringify(samplePlan()) } };
    },
  };

  await interpretGoal('Prepare for board meeting', {
    model: 'llama3.1:8b',
    client,
    onStage: (stage) => {
      stages.push(stage);
    },
  });

  assert.deepEqual(stages, [
    'prompt_built',
    'llm_request_started',
    'llm_response_received',
    'plan_parse_started',
    'repair_prompt_built',
    'repair_request_started',
    'repair_response_received',
    'repair_parse_started',
    'repair_prompt_built',
    'repair_request_started',
    'repair_response_received',
    'repair_parse_started',
    'repair_parse_succeeded',
  ]);
});
