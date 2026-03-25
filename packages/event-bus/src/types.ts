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

export type EventBusTransport = 'nats' | 'in-memory' | 'unknown';

export interface ManagedEventBus extends EventBus {
  close(): Promise<void>;
  getTransport(): EventBusTransport;
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
  lifeos: {
    tickOverdue: 'lifeos.tick.overdue',
    taskCompleted: 'lifeos.task.completed',
    reminderFollowupCreated: 'lifeos.reminder.followup.created',
    voiceWakeDetected: 'lifeos.voice.wake.detected',
    voiceCommandReceived: 'lifeos.voice.command.received',
    voiceCommandProcessed: 'lifeos.voice.command.processed',
    voiceCommandUnhandled: 'lifeos.voice.command.unhandled',
    voiceIntentCalendarAdd: 'lifeos.voice.intent.calendar.add',
    voiceIntentTaskAdd: 'lifeos.voice.intent.task.add',
    voiceIntentResearch: 'lifeos.voice.intent.research',
    voiceIntentNoteAdd: 'lifeos.voice.intent.note.add',
    voiceIntentNoteSearch: 'lifeos.voice.intent.note.search',
    voiceIntentWeather: 'lifeos.voice.intent.weather',
    voiceIntentNews: 'lifeos.voice.intent.news',
    voiceIntentEmailSummarize: 'lifeos.voice.intent.email.summarize',
    voiceIntentBriefing: 'lifeos.voice.intent.briefing',
    voiceIntentPreferenceSet: 'lifeos.voice.intent.preference.set',
    voiceIntentHealthLog: 'lifeos.voice.intent.health.log',
    voiceIntentHealthQuery: 'lifeos.voice.intent.health.query',
    voiceIntentHabitCreate: 'lifeos.voice.intent.habit.create',
    voiceIntentHabitCheckin: 'lifeos.voice.intent.habit.checkin',
    voiceIntentHabitStatus: 'lifeos.voice.intent.habit.status',
    calendarEventAdded: 'lifeos.calendar.event.added',
    taskRescheduleSuggested: 'lifeos.task.reschedule.suggested',
    noteAdded: 'lifeos.note.added',
    noteSearchCompleted: 'lifeos.note.search.completed',
    researchCompleted: 'lifeos.research.completed',
    weatherSnapshotCaptured: 'lifeos.weather.snapshot.captured',
    healthMetricLogged: 'lifeos.health.metric.logged',
    healthStreakUpdated: 'lifeos.health.streak.updated',
    habitCheckinRecorded: 'lifeos.habit.checkin.recorded',
    habitStreakMilestone: 'lifeos.habit.streak.milestone',
    newsDigestReady: 'lifeos.news.digest.ready',
    emailDigestReady: 'lifeos.email.digest.ready',
    orchestratorSuggestion: 'lifeos.orchestrator.suggestion',
    briefingGenerated: 'lifeos.briefing.generated',
    personalityUpdated: 'lifeos.personality.updated',
    memoryStatusGenerated: 'lifeos.memory.status.generated',
    syncDelta: 'lifeos.sync.delta',
    syncAuditLogged: 'lifeos.sync.audit.logged',
    syncConflictDetected: 'lifeos.sync.conflict.detected',
    syncDevicePaired: 'lifeos.sync.device.paired',
    syncDevicesListed: 'lifeos.sync.devices.listed',
    syncDemoCompleted: 'lifeos.sync.demo.completed',
  },
} as const;
