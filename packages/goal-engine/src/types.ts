import type { ApprovalMode } from '@lifeos/approval-workflow';
import { GoalTransitionError, validateGoalTransition } from './state-machine';

export enum GoalStatus {
  proposed = 'proposed',
  validated = 'validated',
  active = 'active',
  blocked = 'blocked',
  paused = 'paused',
  completed = 'completed',
  failed = 'failed',
  archived = 'archived',
}

export enum GoalCategory {
  health = 'health',
  business = 'business',
  production = 'production',
  learning = 'learning',
  creative = 'creative',
  community = 'community',
  finance = 'finance',
  personal = 'personal',
  household = 'household',
}

export enum GoalHorizon {
  daily = 'daily',
  weekly = 'weekly',
  monthly = 'monthly',
  quarterly = 'quarterly',
  yearly = 'yearly',
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: GoalCategory;
  status: GoalStatus;
  horizon: GoalHorizon;
  priority: number;
  source?: string;
  target_date?: string;
  importance_score?: number;
  urgency_score?: number;
  value_score?: number;
  effort_score?: number;
  risk_score?: number;
  alignment_score?: number;
  confidence_score?: number;
  expected_impact?: number;
  desired_outcomes: string[];
  success_metrics: string[];
  parent_goal_id?: string;
  child_goal_ids?: string[];
  milestone_ids?: string[];
  active_plan_id?: string;
  approval_mode?: ApprovalMode;
  auto_decompose?: boolean;
  auto_schedule?: boolean;
  assumptions?: string[];
  policies?: string[];
  constraints?: Constraint[];
  context?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by?: string;
  audit_log: string[];
}

export enum MilestoneStatus {
  pending = 'pending',
  in_progress = 'in_progress',
  completed = 'completed',
  blocked = 'blocked',
}

export interface Milestone {
  id: string;
  title: string;
  goal_id: string;
  status: string;
  milestone_status: MilestoneStatus;
  target_date: string;
  success_metrics: string[];
  dependencies: string[];
  plan_ids?: string[];
  active_plan_id?: string;
}

export enum PlanStatus {
  draft = 'draft',
  ready = 'ready',
  scheduled = 'scheduled',
  executing = 'executing',
  completed = 'completed',
  superseded = 'superseded',
  blocked = 'blocked',
}

export enum PlanType {
  strategic = 'strategic',
  operational = 'operational',
  weekly = 'weekly',
  daily = 'daily',
  recovery = 'recovery',
  fallback = 'fallback',
}

export interface PlanScoring {
  feasibility: number;
  value: number;
  urgency: number;
  overall: number;
}

export interface Plan {
  id: string;
  goal_id: string;
  milestone_id?: string;
  version: number;
  status: PlanStatus;
  plan_type: PlanType;
  superseded_by?: string;
  supersedes?: string;
  estimated_total_minutes?: number;
  risk_score?: number;
  expected_value?: number;
  feasibility_confidence?: number;
  scoring: PlanScoring;
  tasks: string[];
}

export enum TaskStatus {
  proposed = 'proposed',
  ready = 'ready',
  scheduled = 'scheduled',
  in_progress = 'in_progress',
  completed = 'completed',
  blocked = 'blocked',
  skipped = 'skipped',
  cancelled = 'cancelled',
  failed = 'failed',
}

export enum TaskType {
  human_work = 'human_work',
  approval = 'approval',
  analysis = 'analysis',
  communication = 'communication',
  automation = 'automation',
  purchase = 'purchase',
  scheduling = 'scheduling',
  review = 'review',
}

export interface Task {
  id: string;
  goal_id: string;
  plan_id: string;
  title: string;
  description?: string;
  task_type: TaskType;
  approval_mode: ApprovalMode;
  status: TaskStatus;
  scheduled_start?: string;
  scheduled_end?: string;
  preconditions: string[];
  dependencies: string[];
  assignee?: string;
  created_at: string;
  updated_at: string;
}

export enum ConstraintType {
  time_window = 'time_window',
  budget = 'budget',
  calendar = 'calendar',
  inventory = 'inventory',
  energy = 'energy',
  location = 'location',
  weather = 'weather',
  health = 'health',
  social = 'social',
  dependency = 'dependency',
  schedule_conflict = 'schedule_conflict',
  policy = 'policy',
  approval = 'approval',
  privacy = 'privacy',
  capability = 'capability',
  resource = 'resource',
  risk = 'risk',
  custom = 'custom',
}

export enum ViolationAction {
  reject = 'reject',
  warn = 'warn',
  replan = 'replan',
  ask_user = 'ask_user',
}

export interface Constraint {
  id: string;
  type: ConstraintType;
  hard: boolean;
  condition: string;
  violation_action: ViolationAction;
}

export interface ReplanRequest {
  goal_id: string;
  reason: string;
  trigger_type:
    | 'dependency_blocked'
    | 'deadline_moved'
    | 'health_state_changed'
    | 'weather_changed'
    | 'market_opportunity'
    | 'task_failed'
    | 'user_declined'
    | 'resource_unavailable';
  affected_goal_ids: string[];
  affected_plan_ids: string[];
  affected_task_ids: string[];
  severity: 'low' | 'medium' | 'high';
  context?: Record<string, unknown>;
}

export interface ReplanResult {
  plan: Plan;
  new_plan_id?: string;
  superseded_plan_id?: string;
  changed_tasks: string[];
  schedule_shifts?: Record<string, string>;
  rationale: string;
}

export interface FeasibilityAssessment {
  feasible: boolean;
  score: number;
  confidence?: number;
  estimated_duration_days?: number;
  estimated_total_minutes?: number;
  missing_dependencies?: string[];
  risks?: Array<{
    name: string;
    severity: number;
    mitigation: string;
  }>;
  summary?: string;
  blockers: string[];
  suggestions: string[];
}

export interface AgentWorkRequest {
  id: string;
  goal_id: string;
  capability: string;
  requested_capability?: string;
  objective?: string;
  inputs?: Record<string, unknown>;
  due_by?: string;
  approval_mode?: ApprovalMode;
  payload: Record<string, unknown>;
}

export interface AgentWorkResult {
  request_id: string;
  success: boolean;
  output?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  recommendations?: string[];
  confidence?: number;
  error?: string;
}

export class GoalStateMachine {
  transition(goal: Goal, newStatus: GoalStatus): Goal {
    if (!validateGoalTransition(goal.status, newStatus)) {
      throw new GoalTransitionError(goal.status, newStatus);
    }

    return {
      ...goal,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
  }
}

export const GoalEngineEventTopics = {
  consumed: {
    goalProposed: 'goal.proposed',
    taskBlocked: 'task.blocked',
    approvalDecision: 'approval.decision.made',
    policyUpdated: 'policy.updated',
  },
  produced: {
    goalValidated: 'goal.validated',
    planReady: 'plan.ready',
    taskScheduled: 'task.scheduled',
    replanRequested: 'replan.requested',
    replanCompleted: 'replan.completed',
  },
} as const;
