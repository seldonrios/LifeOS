export const HABIT_TOPICS = {
  voiceIntentCreate: 'lifeos.voice.intent.habit.create',
  voiceIntentCheckin: 'lifeos.voice.intent.habit.checkin',
  voiceIntentStatus: 'lifeos.voice.intent.habit.status',
  checkinRecorded: 'lifeos.habit.checkin.recorded',
  streakMilestone: 'lifeos.habit.streak.milestone',
} as const;

export interface HabitCreateIntentPayload {
  name?: unknown;
  description?: unknown;
  utterance?: unknown;
}

export interface HabitCheckinIntentPayload {
  habitName?: unknown;
  habitId?: unknown;
  note?: unknown;
  utterance?: unknown;
}

export interface HabitStatusIntentPayload {
  habitName?: unknown;
  utterance?: unknown;
}

export interface HabitCheckinRecordedEvent {
  habitId: string;
  habitName: string;
  date: string;
  currentStreak: number;
  completedAt: string;
}

export interface HabitStreakMilestoneEvent {
  habitId: string;
  habitName: string;
  milestone: number;
  currentStreak: number;
  achievedAt: string;
}
