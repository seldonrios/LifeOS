// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { GoalSummary } from '@lifeos/contracts';
import { isPlanActiveForDate } from './Plans';

describe('Plans active filtering', () => {
  it('keeps a plan due today visible throughout the day', () => {
    const plan: GoalSummary = {
      id: 'goal-1',
      title: 'Plan due today',
      totalTasks: 3,
      completedTasks: 1,
      priority: 2,
      deadline: '2026-04-14',
    };

    const lateEvening = new Date('2026-04-14T23:59:00');
    expect(isPlanActiveForDate(plan, lateEvening)).toBe(true);
  });
});
