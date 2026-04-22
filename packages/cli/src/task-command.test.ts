import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedAction } from '@lifeos/contracts';
import type { LifeGraphDocument, LifeGraphTask } from '@lifeos/life-graph';

import {
  flattenPlannedActions,
  handleTaskBlock,
  handleTaskCancel,
  handleTaskComplete,
  handleTaskUnblock,
} from './task-command';

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

test('handleTaskBlock transitions todo to blocked and stores blockedReason', async () => {
  const updateCalls: Array<{ id: string; patch: Partial<PlannedAction> }> = [];
  const client = {
    async getPlannedAction() {
      return {
        id: 'action_block_1',
        title: 'Blocked action',
        status: 'todo',
      } as PlannedAction;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction(id: string, patch: Partial<PlannedAction>) {
      updateCalls.push({ id, patch });
    },
  };

  await handleTaskBlock('action_block_1', 'waiting on vendor', client, {
    outputJson: true,
    stdout: () => undefined,
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'action_block_1');
  assert.deepEqual(updateCalls[0]?.patch, {
    status: 'blocked',
    blockedReason: 'waiting on vendor',
  });
});

test('handleTaskBlock works without a reason', async () => {
  const updateCalls: Array<{ id: string; patch: Partial<PlannedAction> }> = [];
  const client = {
    async getPlannedAction() {
      return {
        id: 'action_block_2',
        title: 'Block without reason',
        status: 'todo',
      } as PlannedAction;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction(id: string, patch: Partial<PlannedAction>) {
      updateCalls.push({ id, patch });
    },
  };

  await handleTaskBlock('action_block_2', undefined, client, {
    outputJson: true,
    stdout: () => undefined,
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'action_block_2');
  assert.deepEqual(updateCalls[0]?.patch, {
    status: 'blocked',
  });
});

test('handleTaskCancel transitions todo to cancelled and cancels reminders', async () => {
  const updateCalls: Array<{ id: string; patch: Partial<PlannedAction> }> = [];
  const cancelCalls: string[] = [];
  const client = {
    async getPlannedAction() {
      return {
        id: 'action_cancel_1',
        title: 'Cancel action',
        status: 'todo',
      } as PlannedAction;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction(id: string, patch: Partial<PlannedAction>) {
      updateCalls.push({ id, patch });
    },
    async cancelRemindersForAction(actionId: string) {
      cancelCalls.push(actionId);
    },
  };

  await handleTaskCancel('action_cancel_1', client, {
    outputJson: true,
    stdout: () => undefined,
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'action_cancel_1');
  assert.deepEqual(updateCalls[0]?.patch, { status: 'cancelled' });
  assert.deepEqual(cancelCalls, ['action_cancel_1']);
});

test('handleTaskUnblock transitions blocked to todo and clears blockedReason', async () => {
  const updateCalls: Array<{ id: string; patch: Partial<PlannedAction> }> = [];
  const client = {
    async getPlannedAction() {
      return {
        id: 'action_unblock_1',
        title: 'Unblock action',
        status: 'blocked',
        blockedReason: 'waiting on vendor',
      } as PlannedAction;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction(id: string, patch: Partial<PlannedAction>) {
      updateCalls.push({ id, patch });
    },
  };

  await handleTaskUnblock('action_unblock_1', client, {
    outputJson: true,
    stdout: () => undefined,
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'action_unblock_1');
  assert.deepEqual(updateCalls[0]?.patch, { status: 'todo', blockedReason: undefined });
});

test('handleTaskUnblock transitions deferred to todo and clears deferredUntil', async () => {
  const updateCalls: Array<{ id: string; patch: Partial<PlannedAction> }> = [];
  const client = {
    async getPlannedAction() {
      return {
        id: 'action_unblock_2',
        title: 'Deferred action',
        status: 'deferred',
        deferredUntil: '2026-05-01T00:00:00.000Z',
      } as PlannedAction;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction(id: string, patch: Partial<PlannedAction>) {
      updateCalls.push({ id, patch });
    },
  };

  await handleTaskUnblock('action_unblock_2', client, {
    outputJson: true,
    stdout: () => undefined,
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'action_unblock_2');
  assert.deepEqual(updateCalls[0]?.patch, { status: 'todo', deferredUntil: undefined });
});

test('handleTaskUnblock throws when action is neither blocked nor deferred', async () => {
  const client = {
    async getPlannedAction() {
      return {
        id: 'action_unblock_3',
        title: 'Done action',
        status: 'done',
      } as PlannedAction;
    },
    async loadGraph() {
      return createGraph();
    },
    async updatePlannedAction() {
      return;
    },
  };

  await assert.rejects(
    () =>
      handleTaskUnblock('action_unblock_3', client, {
        outputJson: true,
        stdout: () => undefined,
      }),
    /not blocked or deferred/i,
  );
});

test('flattenPlannedActions includes blocked and deferred items', () => {
  const graph = createGraph({
    plannedActions: [
      {
        id: 'action_todo',
        title: 'Todo action',
        status: 'todo',
      },
      {
        id: 'action_blocked',
        title: 'Blocked action',
        status: 'blocked',
      },
      {
        id: 'action_deferred',
        title: 'Deferred action',
        status: 'deferred',
      },
      {
        id: 'action_done',
        title: 'Done action',
        status: 'done',
      },
      {
        id: 'action_cancelled',
        title: 'Cancelled action',
        status: 'cancelled',
      },
    ] as PlannedAction[],
  });

  const rows = flattenPlannedActions(graph);
  const ids = rows.map((row) => row.id);
  assert.ok(ids.includes('action_todo'));
  assert.ok(ids.includes('action_blocked'));
  assert.ok(ids.includes('action_deferred'));
  assert.equal(ids.includes('action_done'), false);
  assert.equal(ids.includes('action_cancelled'), false);
});
