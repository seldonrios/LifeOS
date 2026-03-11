import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GoalTransitionError,
  validateGoalTransition,
  validatePlanTransition,
  validateTaskTransition,
} from './state-machine';
import {
  GoalCategory,
  GoalHorizon,
  GoalStateMachine,
  GoalStatus,
  PlanStatus,
  TaskStatus,
  type Goal,
} from './types';

test('validateGoalTransition proposed -> validated is legal', () => {
  assert.equal(validateGoalTransition(GoalStatus.proposed, GoalStatus.validated), true);
});

test('validateGoalTransition completed -> active is illegal', () => {
  assert.equal(validateGoalTransition(GoalStatus.completed, GoalStatus.active), false);
});

test('validatePlanTransition draft -> superseded is legal', () => {
  assert.equal(validatePlanTransition(PlanStatus.draft, PlanStatus.superseded), true);
});

test('validateTaskTransition in_progress -> completed is legal', () => {
  assert.equal(validateTaskTransition(TaskStatus.in_progress, TaskStatus.completed), true);
});

test('validateTaskTransition completed -> ready is illegal', () => {
  assert.equal(validateTaskTransition(TaskStatus.completed, TaskStatus.ready), false);
});

test('GoalStateMachine.transition throws GoalTransitionError for completed -> active', () => {
  const stateMachine = new GoalStateMachine();
  const goal: Goal = {
    id: 'g1',
    title: 'Goal',
    category: GoalCategory.personal,
    status: GoalStatus.completed,
    horizon: GoalHorizon.weekly,
    priority: 1,
    desired_outcomes: [],
    success_metrics: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'tester',
    audit_log: [],
  };

  assert.throws(() => stateMachine.transition(goal, GoalStatus.active), GoalTransitionError);
});
