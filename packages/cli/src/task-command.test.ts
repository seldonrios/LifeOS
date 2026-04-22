import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedAction } from '@lifeos/contracts';
import type { LifeGraphDocument, LifeGraphTask } from '@lifeos/life-graph';

import { flattenPlannedActions, handleTaskComplete } from './task-command';

function createGraph(overrides: Partial<LifeGraphDocument> = {}): LifeGraphDocument {
  return {
    version: '0.1.0',
    updatedAt: '2026-04-22T00:00:00.000Z',
    plans: [],
    captureEntries: [],
    plannedActions: [],
    reminderEvents: [],
    ...overrides,
  };
}

test('flattenPlannedActions filters done/cancelled and sorts overdue then dueDate then title', () => {
  const graph = createGraph({
    plannedActions: [
      {
        id: 'action_done',
        title: 'Done action',
        status: 'done',
        dueDate: '2026-04-20',
      },
      {
        id: 'action_cancelled',
        title: 'Cancelled action',
        status: 'cancelled',
        dueDate: '2026-04-20',
      },
      {
        id: 'action_overdue_b',
        title: 'B overdue',
        status: 'todo',
        dueDate: '2026-04-20',
      },
      {
        id: 'action_overdue_a',
        title: 'A overdue',
        status: 'todo',
        dueDate: '2026-04-20',
      },
      {
        id: 'action_due_soon',
        title: 'Soon due',
        status: 'todo',
        dueDate: '2026-04-23',
      },
      {
        id: 'action_no_due',
        title: 'No due',
        status: 'todo',
      },
    ] as PlannedAction[],
  });

  const rows = flattenPlannedActions(graph, new Date('2026-04-22T12:00:00.000Z'));

  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['action_overdue_a', 'action_overdue_b', 'action_due_soon', 'action_no_due'],
  );
  assert.equal(rows[0]?.overdue, true);
  assert.equal(rows[2]?.overdue, false);
});

test('handleTaskComplete completes exact planned action first and cancels reminders', async () => {
  const stdout: string[] = [];
  const updateCalls: Array<{ id: string; patch: Partial<PlannedAction> }> = [];
  const cancelCalls: string[] = [];
  let loadGraphCalls = 0;

  const client = {
    async getPlannedAction(id: string) {
      if (id === 'action_exact_1') {
        return {
          id: 'action_exact_1',
          title: 'Exact planned action',
          status: 'todo',
          sourceCapture: 'capture_1',
        } as PlannedAction;
      }
      return undefined;
    },
    async loadGraph() {
      loadGraphCalls += 1;
      return createGraph();
    },
    async updatePlannedAction(id: string, patch: Partial<PlannedAction>) {
      updateCalls.push({ id, patch });
    },
    async cancelRemindersForAction(actionId: string) {
      cancelCalls.push(actionId);
    },
    async saveGraph() {
      return;
    },
  };

  const result = await handleTaskComplete('action_exact_1', client, {
    outputJson: true,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(result.source, 'planned-action');
  assert.equal(result.id, 'action_exact_1');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'action_exact_1');
  assert.equal(updateCalls[0]?.patch.status, 'done');
  assert.equal(cancelCalls.length, 1);
  assert.equal(cancelCalls[0], 'action_exact_1');
  assert.equal(loadGraphCalls, 0);
  assert.equal(stdout.length > 0, true);
});

test('handleTaskComplete throws on ambiguous planned action prefix', async () => {
  const client = {
    async getPlannedAction() {
      return undefined;
    },
    async loadGraph() {
      return createGraph({
        plannedActions: [
          { id: 'action_abc12345', title: 'One', status: 'todo' },
          { id: 'action_abc67890', title: 'Two', status: 'todo' },
        ] as PlannedAction[],
      });
    },
    async updatePlannedAction() {
      return;
    },
    async cancelRemindersForAction() {
      return;
    },
    async saveGraph() {
      return;
    },
  };

  await assert.rejects(
    () =>
      handleTaskComplete('action_abc', client, {
        outputJson: true,
        stdout: () => undefined,
      }),
    /ambiguous/i,
  );
});

test('handleTaskComplete throws not found when neither planned action nor task exists', async () => {
  const client = {
    async getPlannedAction() {
      return undefined;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction() {
      return;
    },
    async cancelRemindersForAction() {
      return;
    },
    async saveGraph() {
      return;
    },
  };

  await assert.rejects(
    () =>
      handleTaskComplete('missing_task', client, {
        outputJson: true,
        stdout: () => undefined,
      }),
    /not found/i,
  );
});

test('handleTaskComplete falls back to GoalPlan task compatibility shim', async () => {
  const savedGraphs: LifeGraphDocument[] = [];
  const task: LifeGraphTask = {
    id: 'task_alpha1234',
    title: 'Legacy task',
    status: 'todo',
    priority: 5,
    dueDate: '2026-04-22',
  };

  const client = {
    async getPlannedAction() {
      return undefined;
    },
    async loadGraph() {
      return createGraph({
        plans: [
          {
            id: 'goal_legacy',
            title: 'Legacy Goal',
            description: 'Compatibility plan',
            deadline: '2026-04-30',
            tasks: [task],
            createdAt: '2026-04-20T12:00:00.000Z',
          },
        ],
      });
    },
    async updatePlannedAction() {
      throw new Error('should not update planned action in legacy fallback');
    },
    async cancelRemindersForAction() {
      throw new Error('should not cancel reminders in legacy fallback');
    },
    async saveGraph(graph: LifeGraphDocument) {
      savedGraphs.push(graph);
    },
  };

  const result = await handleTaskComplete('task_alpha', client, {
    outputJson: true,
    stdout: () => undefined,
  });

  assert.equal(result.source, 'task');
  assert.equal(result.id, 'task_alpha1234');
  assert.equal(savedGraphs.length, 1);
  assert.equal(savedGraphs[0]?.plans[0]?.tasks[0]?.status, 'done');
});
