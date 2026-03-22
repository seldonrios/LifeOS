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
        plans: [
          {
            id: 'goal_1',
            title: 'Board Prep',
            description: 'Prepare board materials',
            deadline: '2026-03-30',
            createdAt: '2026-03-20T12:00:00.000Z',
            tasks: [
              {
                id: 'task_1',
                title: 'Draft deck',
                status: 'todo',
                priority: 5,
                dueDate: '2026-03-21',
              },
              {
                id: 'task_2',
                title: 'Rehearse',
                status: 'done',
                priority: 4,
                dueDate: '2026-03-21',
              },
            ],
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
});
