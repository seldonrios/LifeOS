function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeForComparison(value: string): string {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' '),
  );
}

function toWakePattern(phrase: string): RegExp {
  const tokens = normalizeWhitespace(phrase).split(' ').map(escapeForRegex);
  return new RegExp(`^${tokens.join('\\s+')}([\\s,.:;!?-]*)`, 'i');
}

export interface WakeWordMatch {
  kind: 'none' | 'wake_only' | 'wake_with_command';
  matchedPhrase?: string;
  command?: string;
}

export interface WakeWordDetectorOptions {
  wakePhrases?: string[];
}

export class WakeWordDetector {
  private readonly wakePhrases: string[];
  private readonly patterns: Array<{ phrase: string; pattern: RegExp }>;

  constructor(options: WakeWordDetectorOptions = {}) {
    this.wakePhrases = options.wakePhrases?.length
      ? options.wakePhrases.map((phrase) => normalizeWhitespace(phrase)).filter(Boolean)
      : ['Hey LifeOS', 'Hey Life OS'];
    this.patterns = this.wakePhrases.map((phrase) => ({
      phrase,
      pattern: toWakePattern(phrase),
    }));
  }

  detect(text: string): WakeWordMatch {
    const raw = text.trim();
    if (!raw) {
      return { kind: 'none' };
    }

    const normalized = normalizeForComparison(raw);
    for (const entry of this.patterns) {
      const normalizedPhrase = normalizeForComparison(entry.phrase);
      if (normalized === normalizedPhrase) {
        return {
          kind: 'wake_only',
          matchedPhrase: entry.phrase,
        };
      }

      const match = raw.match(entry.pattern);
      if (!match) {
        continue;
      }

      const command = raw.slice(match[0].length).trim();
      if (!command) {
        return {
          kind: 'wake_only',
          matchedPhrase: entry.phrase,
        };
      }

      return {
        kind: 'wake_with_command',
        matchedPhrase: entry.phrase,
        command,
      };
    }

    return { kind: 'none' };
  }

  getPrimaryWakePhrase(): string {
    return this.wakePhrases[0] ?? 'Hey LifeOS';
  }
}
