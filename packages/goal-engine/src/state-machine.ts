import type { GoalStatus, PlanStatus, TaskStatus } from './types';

const asGoalStatus = (status: string): GoalStatus => status as GoalStatus;
const asPlanStatus = (status: string): PlanStatus => status as PlanStatus;
const asTaskStatus = (status: string): TaskStatus => status as TaskStatus;

export class GoalTransitionError extends Error {
  constructor(
    public readonly from: GoalStatus,
    public readonly to: GoalStatus,
  ) {
    super(`Illegal goal transition: ${from} -> ${to}`);
    this.name = 'GoalTransitionError';
  }
}

export const GOAL_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  proposed: [asGoalStatus('validated')],
  validated: [asGoalStatus('active')],
  active: [
    asGoalStatus('blocked'),
    asGoalStatus('paused'),
    asGoalStatus('completed'),
    asGoalStatus('failed'),
  ],
  blocked: [asGoalStatus('active')],
  paused: [asGoalStatus('active'), asGoalStatus('archived')],
  completed: [asGoalStatus('archived')],
  failed: [asGoalStatus('archived')],
  archived: [],
};

export const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft: [asPlanStatus('ready'), asPlanStatus('superseded')],
  ready: [asPlanStatus('scheduled'), asPlanStatus('superseded')],
  scheduled: [asPlanStatus('executing'), asPlanStatus('superseded')],
  executing: [asPlanStatus('completed'), asPlanStatus('blocked')],
  blocked: [asPlanStatus('ready')],
  completed: [],
  superseded: [],
};

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  proposed: [asTaskStatus('ready')],
  ready: [asTaskStatus('scheduled'), asTaskStatus('blocked'), asTaskStatus('skipped')],
  scheduled: [asTaskStatus('in_progress'), asTaskStatus('blocked'), asTaskStatus('cancelled')],
  in_progress: [asTaskStatus('completed'), asTaskStatus('blocked'), asTaskStatus('failed')],
  blocked: [asTaskStatus('ready')],
  completed: [],
  skipped: [],
  cancelled: [],
  failed: [],
};

export function validateGoalTransition(from: GoalStatus, to: GoalStatus): boolean {
  return GOAL_TRANSITIONS[from].includes(to);
}

export function validatePlanTransition(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_TRANSITIONS[from].includes(to);
}

export function validateTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}
