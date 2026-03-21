import assert from 'node:assert/strict';
import test from 'node:test';

import { GoalPlanParseError } from '@lifeos/goal-engine';

import { interpretGoal, type OllamaClient, type OllamaGenerateRequest } from './goal-interpreter';

test('interpretGoal sends model with JSON format and temperature', async () => {
  const capturedRequests: OllamaGenerateRequest[] = [];

  const client: OllamaClient = {
    async generate(request) {
      capturedRequests.push(request);
      return {
        response: JSON.stringify({
          title: 'Board Meeting Prep',
          description: 'Prepare deck and speaking notes.',
          priority: 'high',
          deadline: '2026-03-26',
          subtasks: [],
          neededResources: ['Latest KPI report'],
          relatedAreas: ['work'],
        }),
      };
    },
  };

  const plan = await interpretGoal('Help me prepare for quarterly board meeting next Thursday', {
    model: 'llama3.1:8b',
    now: new Date('2026-03-21T12:00:00-04:00'),
    client,
  });

  assert.equal(capturedRequests[0]?.model, 'llama3.1:8b');
  assert.equal(capturedRequests[0]?.options?.temperature, 0.3);
  assert.equal(typeof capturedRequests[0]?.format, 'object');
  assert.equal(plan.title, 'Board Meeting Prep');
});

test('interpretGoal retries with repair prompt after invalid output', async () => {
  const capturedRequests: OllamaGenerateRequest[] = [];
  const client: OllamaClient = {
    async generate(request) {
      capturedRequests.push(request);
      if (capturedRequests.length === 1) {
        return { response: 'not valid json' };
      }

      return {
        response: JSON.stringify({
          title: 'Board Meeting Prep',
          description: 'Prepare deck and speaking notes.',
          priority: 'high',
          deadline: null,
          subtasks: [],
          neededResources: [],
          relatedAreas: ['work'],
        }),
      };
    },
  };

  const plan = await interpretGoal('Prepare for board meeting', {
    model: 'llama3.1:8b',
    client,
  });

  assert.equal(plan.priority, 'high');
  assert.equal(capturedRequests.length, 2);
  assert.match(capturedRequests[1]?.prompt ?? '', /previous output was invalid/i);
});

test('interpretGoal throws deterministic GoalPlanParseError after repair failure', async () => {
  const client: OllamaClient = {
    async generate() {
      return { response: 'still not json' };
    },
  };

  await assert.rejects(
    () =>
      interpretGoal('Prepare for board meeting', {
        model: 'llama3.1:8b',
        client,
      }),
    (error: unknown) =>
      error instanceof GoalPlanParseError &&
      /after repair attempt/i.test(error.message) &&
      error.rawOutput === 'still not json',
  );
});

test('interpretGoal emits safe stage callbacks in order', async () => {
  const stages: string[] = [];
  let callCount = 0;
  const client: OllamaClient = {
    async generate() {
      callCount += 1;
      if (callCount === 1) {
        return { response: 'bad-json' };
      }

      return {
        response: JSON.stringify({
          title: 'Board Meeting Prep',
          description: 'Prepare deck and speaking notes.',
          priority: 'high',
          deadline: null,
          subtasks: [],
          neededResources: [],
          relatedAreas: ['work'],
        }),
      };
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
    'repair_parse_succeeded',
  ]);
});
