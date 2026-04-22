import assert from 'node:assert/strict';
import test from 'node:test';

import type { LifeGraphClient } from '@lifeos/life-graph';

import { runTick } from './tick';

test('runTick returns overdue tasks for unfinished past-due items', async () => {
  const client: Pick<LifeGraphClient, 'loadGraph'> = {
    async loadGraph() {
      return {
        version: '0.1.0',
        updatedAt: '2026-03-22T12:00:00.000Z',
        plans: [],
        plannedActions: [
          {
            id: 'action_1',
            title: 'Draft deck',
            status: 'todo',
            dueDate: '2026-03-21',
          },
          {
            id: 'action_2',
            title: 'Rehearse',
            status: 'done',
            dueDate: '2026-03-21',
          },
        ],
      };
    },
  };

  const result = await runTick({
    client,
    now: new Date('2026-03-22T12:00:00.000Z'),
  });

  assert.equal(result.checkedTasks, 2);
  assert.equal(result.overdueTasks.length, 1);
  assert.equal(result.overdueTasks[0]?.title, 'Draft deck');
  assert.equal(result.overdueTasks[0]?.planId, undefined);
});

test('runTick skips done and cancelled actions', async () => {
  const client: Pick<LifeGraphClient, 'loadGraph'> = {
    async loadGraph() {
      return {
        version: '0.1.0',
        updatedAt: '2026-03-22T12:00:00.000Z',
        plans: [],
        plannedActions: [
          {
            id: 'action_1',
            title: 'Draft deck',
            status: 'todo',
            dueDate: '2026-03-21',
          },
          {
            id: 'action_2',
            title: 'Rehearse',
            status: 'done',
            dueDate: '2026-03-21',
          },
          {
            id: 'action_3',
            title: 'Cancel prep',
            status: 'cancelled',
            dueDate: '2026-03-21',
          },
        ],
      };
    },
  };

  const result = await runTick({
    client,
    now: new Date('2026-03-22T12:00:00.000Z'),
  });

  assert.equal(result.checkedTasks, 3);
  assert.equal(result.overdueTasks.length, 1);
});
