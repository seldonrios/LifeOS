export interface BaseEvent<T> {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  version: string;
  data: T;
  metadata?: {
    correlation_id?: string;
    trace_id?: string;
    permissions?: string[];
    [key: string]: unknown;
  };
}

export enum EventCategory {
  State = 'State',
  Command = 'Command',
  Observation = 'Observation',
}

export interface EventBus {
  publish<T>(topic: string, event: BaseEvent<T>): Promise<void>;
  subscribe<T>(topic: string, handler: (event: BaseEvent<T>) => Promise<void>): Promise<void>;
}

export const Topics = {
  person: {
    created: 'person.created',
    updated: 'person.updated',
  },
  health: {
    changed: 'health.changed',
    checkRequested: 'health.check.requested',
  },
  production: {
    taskCreated: 'production.task.created',
    taskCompleted: 'production.task.completed',
  },
  goal: {
    proposed: 'goal.proposed',
    updated: 'goal.updated',
  },
  plan: {
    created: 'plan.created',
    revised: 'plan.revised',
  },
  task: {
    scheduled: 'task.scheduled',
    statusChanged: 'task.status.changed',
  },
  module: {
    loaded: 'module.loaded',
    failed: 'module.failed',
  },
  device: {
    stateChanged: 'device.state.changed',
    commandIssued: 'device.command.issued',
  },
  automation: {
    triggerFired: 'automation.trigger.fired',
    actionExecuted: 'automation.action.executed',
  },
  agent: {
    workRequested: 'agent.work.requested',
    workCompleted: 'agent.work.completed',
  },
} as const;
