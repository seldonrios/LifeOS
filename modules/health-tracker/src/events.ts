export const HEALTH_TOPICS = {
  voiceIntentLog: 'lifeos.voice.intent.health.log',
  voiceIntentQuery: 'lifeos.voice.intent.health.query',
  metricLogged: 'lifeos.health.metric.logged',
  streakUpdated: 'lifeos.health.streak.updated',
} as const;

export interface HealthLogIntentPayload {
  metric?: unknown;
  value?: unknown;
  unit?: unknown;
  note?: unknown;
  utterance?: unknown;
}

export interface HealthQueryIntentPayload {
  metric?: unknown;
  period?: unknown;
  utterance?: unknown;
}

export interface HealthMetricLoggedEvent {
  metric: string;
  value: number;
  unit: string;
  loggedAt: string;
  entryId: string;
}

export interface HealthStreakUpdatedEvent {
  metric: string;
  currentStreak: number;
  longestStreak: number;
  date: string;
}
