export interface ParsedHealthLog {
  metric: string;
  value: number;
  unit: string;
  note?: string;
}

export interface ParsedHealthQuery {
  metric?: string;
  period?: number;
}

function parseNumber(input: string): number | null {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : null;
}

function normalizeUtterance(utterance: string): string {
  return utterance.trim().toLowerCase();
}

export function parseHealthLog(utterance: string): ParsedHealthLog | null {
  const normalized = normalizeUtterance(utterance);
  if (!normalized) {
    return null;
  }

  const stepsMatch = normalized.match(/(?:log\s+)?(\d+(?:\.\d+)?)\s+steps\b/i);
  if (stepsMatch?.[1]) {
    const value = parseNumber(stepsMatch[1]);
    if (value !== null) {
      return {
        metric: 'steps',
        value,
        unit: 'steps',
      };
    }
  }

  const sleepMatch = normalized.match(/(?:i\s+)?slept\s+(\d+(?:\.\d+)?)\s+hours?\b/i);
  if (sleepMatch?.[1]) {
    const value = parseNumber(sleepMatch[1]);
    if (value !== null) {
      return {
        metric: 'sleep',
        value,
        unit: 'hours',
      };
    }
  }

  const weightMatch = normalized.match(/weight\s+(\d+(?:\.\d+)?)\s*(kg|lb|lbs)\b/i);
  if (weightMatch?.[1] && weightMatch[2]) {
    const value = parseNumber(weightMatch[1]);
    if (value !== null) {
      const rawUnit = weightMatch[2].toLowerCase();
      return {
        metric: 'weight',
        value,
        unit: rawUnit === 'lbs' ? 'lb' : rawUnit,
      };
    }
  }

  const heartRateMatch = normalized.match(/heart\s*rate\s+(\d+(?:\.\d+)?)\s*bpm\b/i);
  if (heartRateMatch?.[1]) {
    const value = parseNumber(heartRateMatch[1]);
    if (value !== null) {
      return {
        metric: 'heart_rate',
        value,
        unit: 'bpm',
      };
    }
  }

  const genericMatch = normalized.match(/(?:log\s+)?(\d+(?:\.\d+)?)\s+([a-z][a-z_ -]{0,30})\b/i);
  if (genericMatch?.[1] && genericMatch[2]) {
    const value = parseNumber(genericMatch[1]);
    if (value !== null) {
      const unit = genericMatch[2].trim().replace(/\s+/g, '_');
      return {
        metric: 'custom',
        value,
        unit: unit || 'units',
      };
    }
  }

  return null;
}

export function parseHealthQuery(utterance: string): ParsedHealthQuery | null {
  const normalized = normalizeUtterance(utterance);
  if (!normalized) {
    return null;
  }

  const metric =
    ['steps', 'sleep', 'weight', 'heart rate', 'heart_rate'].find((candidate) =>
      normalized.includes(candidate),
    ) ?? null;

  let period: number | undefined;
  if (normalized.includes('today')) {
    period = 1;
  } else if (normalized.includes('this week') || normalized.includes('last week')) {
    period = 7;
  } else if (normalized.includes('month')) {
    period = 30;
  }

  if (!metric && period === undefined) {
    return null;
  }

  return {
    metric: metric === 'heart rate' ? 'heart_rate' : (metric ?? undefined),
    period,
  };
}
