import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GoalPlanParseError,
  buildGoalInterpretationPrompt,
  parseGoalInterpretationPlan,
  validateGoalInterpretationPlan,
} from './mvp-plan';

test('validateGoalInterpretationPlan accepts a valid plan', () => {
  const plan = validateGoalInterpretationPlan({
    title: 'Board Meeting Prep',
    description: 'Prepare narrative and supporting materials for board meeting.',
    priority: 'high',
    deadline: '2026-03-26',
    subtasks: [
      {
        description: 'Draft board deck',
        dependsOn: [],
        estimatedHours: 3,
      },
    ],
    neededResources: ['Financial report'],
    relatedAreas: ['work'],
  });

  assert.equal(plan.priority, 'high');
  assert.equal(plan.deadline, '2026-03-26');
});

test('validateGoalInterpretationPlan rejects invalid priority', () => {
  assert.throws(
    () =>
      validateGoalInterpretationPlan({
        title: 'Board Meeting Prep',
        description: 'Prepare deck.',
        priority: 'urgent',
        deadline: null,
        subtasks: [],
        neededResources: [],
        relatedAreas: ['work'],
      }),
    /Invalid (enum value|option)/,
  );
});

test('validateGoalInterpretationPlan rejects invalid deadline format/date', () => {
  assert.throws(
    () =>
      validateGoalInterpretationPlan({
        title: 'Board Meeting Prep',
        description: 'Prepare deck.',
        priority: 'high',
        deadline: '2026-02-30',
        subtasks: [],
        neededResources: [],
        relatedAreas: ['work'],
      }),
    /deadline must be a real calendar date/,
  );
});

test('parseGoalInterpretationPlan parses direct JSON output', () => {
  const raw = JSON.stringify({
    title: 'Board Meeting Prep',
    description: 'Prepare deck and notes.',
    priority: 'high',
    deadline: null,
    subtasks: [],
    neededResources: [],
    relatedAreas: ['work'],
  });

  const plan = parseGoalInterpretationPlan(raw);
  assert.equal(plan.title, 'Board Meeting Prep');
});

test('parseGoalInterpretationPlan parses wrapped JSON output', () => {
  const raw = `
Plan draft:
\`\`\`json
{
  "title": "Board Meeting Prep",
  "description": "Prepare deck and notes.",
  "priority": "high",
  "deadline": null,
  "subtasks": [],
  "neededResources": [],
  "relatedAreas": ["work"]
}
\`\`\`
`;

  const plan = parseGoalInterpretationPlan(raw);
  assert.equal(plan.priority, 'high');
});

test('parseGoalInterpretationPlan throws GoalPlanParseError for invalid output', () => {
  assert.throws(
    () => parseGoalInterpretationPlan('not-json'),
    (error: unknown) => error instanceof GoalPlanParseError,
  );
});

test('buildGoalInterpretationPrompt includes date context and schema fields', () => {
  const now = new Date('2026-03-21T10:30:00-04:00');
  const prompt = buildGoalInterpretationPrompt('Help me prep for board meeting next Thursday', now);

  assert.match(prompt, /Current date \(YYYY-MM-DD\): 2026-03-21/);
  assert.match(prompt, /"priority": "high" \| "medium" \| "low"/);
});
