import assert from 'node:assert/strict';
import test from 'node:test';

import { GoalPlanParseError } from '@lifeos/goal-engine';

import { interpretGoal, type OllamaClient } from './goal-interpreter';

test('interpretGoal sends model and parses valid JSON response', async () => {
  let capturedModel = '';
  let capturedPrompt = '';

  const client: OllamaClient = {
    async generate(request) {
      capturedModel = request.model;
      capturedPrompt = request.prompt;
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

  assert.equal(capturedModel, 'llama3.1:8b');
  assert.match(capturedPrompt, /Current date \(YYYY-MM-DD\): 2026-03-21/);
  assert.equal(plan.title, 'Board Meeting Prep');
});

test('interpretGoal parses wrapped JSON output', async () => {
  const client: OllamaClient = {
    async generate() {
      return {
        response: `
Here is your plan:
\`\`\`json
{
  "title": "Board Meeting Prep",
  "description": "Prepare deck and speaking notes.",
  "priority": "high",
  "deadline": null,
  "subtasks": [],
  "neededResources": [],
  "relatedAreas": ["work"]
}
\`\`\`
`,
      };
    },
  };

  const plan = await interpretGoal('Prepare for board meeting', {
    model: 'llama3.1:8b',
    client,
  });

  assert.equal(plan.priority, 'high');
  assert.equal(plan.deadline, null);
});

test('interpretGoal throws GoalPlanParseError when output is invalid', async () => {
  const client: OllamaClient = {
    async generate() {
      return { response: 'definitely not json' };
    },
  };

  await assert.rejects(
    () =>
      interpretGoal('Prepare for board meeting', {
        model: 'llama3.1:8b',
        client,
      }),
    (error: unknown) => error instanceof GoalPlanParseError,
  );
});
