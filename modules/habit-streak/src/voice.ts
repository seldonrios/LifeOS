import type { Habit } from './store';

export interface ParsedHabitIntent {
  intent: 'habit.create' | 'habit.checkin' | 'habit.status';
  payload: Record<string, unknown>;
}

function normalizeUtterance(utterance: string): string {
  return utterance.trim().toLowerCase();
}

function normalizeHabitCandidate(value: string): string {
  const normalized = normalizeUtterance(value)
    .replace(/\b(my|daily|habit|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.endsWith('ated')) {
    return `${normalized.slice(0, -4)}ate`;
  }
  if (normalized.endsWith('ied')) {
    return `${normalized.slice(0, -3)}y`;
  }
  if (normalized.endsWith('ation') && normalized.length > 6) {
    return `${normalized.slice(0, -5)}ate`;
  }
  if (normalized.endsWith('ed') && normalized.length > 3) {
    return normalized.slice(0, -2);
  }

  return normalized;
}

export function parseHabitCreate(utterance: string): ParsedHabitIntent | null {
  const normalized = normalizeUtterance(utterance);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/(?:create|add|new)\s+habit\s+(.+?)(?:\s+daily)?$/i);
  if (!match?.[1]) {
    return null;
  }

  return {
    intent: 'habit.create',
    payload: {
      name: match[1].trim(),
    },
  };
}

export function parseHabitCheckin(utterance: string): ParsedHabitIntent | null {
  const normalized = normalizeUtterance(utterance);
  if (!normalized) {
    return null;
  }

  const directMatch = normalized.match(
    /(?:i\s+)?(?:did|completed?|done with|check(?:ed)?\s+in)\s+(.+?)(?:\s+today)?$/i,
  );
  if (directMatch?.[1]) {
    return {
      intent: 'habit.checkin',
      payload: {
        habitName: normalizeHabitCandidate(directMatch[1]),
      },
    };
  }

  const checkInMatch = normalized.match(/^check\s+in\s+(.+?)$/i);
  if (checkInMatch?.[1]) {
    return {
      intent: 'habit.checkin',
      payload: {
        habitName: normalizeHabitCandidate(checkInMatch[1]),
      },
    };
  }

  const genericTodayMatch = normalized.match(/^i\s+(.+?)\s+today$/i);
  if (genericTodayMatch?.[1]) {
    return {
      intent: 'habit.checkin',
      payload: {
        habitName: normalizeHabitCandidate(genericTodayMatch[1]),
      },
    };
  }

  return null;
}

export function parseHabitStatus(utterance: string): ParsedHabitIntent | null {
  const normalized = normalizeUtterance(utterance);
  if (!normalized) {
    return null;
  }

  if (normalized === 'show my habits') {
    return {
      intent: 'habit.status',
      payload: {},
    };
  }

  const match = normalized.match(/^how(?:'s|\s+is)\s+my\s+(.+?)\s+streak$/i);
  if (!match?.[1]) {
    return null;
  }

  return {
    intent: 'habit.status',
    payload: {
      habitName: normalizeHabitCandidate(match[1]),
    },
  };
}

export function fuzzyMatchHabit(utterance: string, activeHabits: Habit[]): Habit | null {
  const normalizedUtterance = normalizeHabitCandidate(utterance);
  if (!normalizedUtterance) {
    return null;
  }

  return (
    activeHabits.find((habit) => {
      const normalizedName = normalizeHabitCandidate(habit.name);
      return (
        normalizedName.length > 0 &&
        (normalizedUtterance.includes(normalizedName) ||
          normalizedName.includes(normalizedUtterance))
      );
    }) ?? null
  );
}
