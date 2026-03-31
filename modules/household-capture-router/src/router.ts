import type {
  HouseholdVoiceCaptureCreated,
  HouseholdChoreCreateRequested,
  HouseholdNoteCreateRequested,
  HouseholdReminderCreateRequested,
  HouseholdShoppingItemAddRequested,
} from '@lifeos/contracts';

export type RouteKind = 'shopping' | 'reminder' | 'chore' | 'note';

export interface RouteOptions {
  aiEnabled: boolean;
  aiMinimumConfidence?: number;
  classifyWithAi?: (text: string) => Promise<AiClassification>;
}

export interface AiClassification {
  kind: RouteKind | 'unknown';
  confidence: number;
  extractedText?: string;
}

export type RoutedPayload =
  | {
      kind: 'shopping';
      topic: 'lifeos.household.shopping.item.add.requested';
      payload: HouseholdShoppingItemAddRequested;
      confidence: number;
      via: 'deterministic' | 'ai';
    }
  | {
      kind: 'reminder';
      topic: 'lifeos.household.reminder.create.requested';
      payload: HouseholdReminderCreateRequested;
      confidence: number;
      via: 'deterministic' | 'ai';
    }
  | {
      kind: 'chore';
      topic: 'lifeos.household.chore.create.requested';
      payload: HouseholdChoreCreateRequested;
      confidence: number;
      via: 'deterministic' | 'ai';
    }
  | {
      kind: 'note';
      topic: 'lifeos.household.note.create.requested';
      payload: HouseholdNoteCreateRequested;
      confidence: number;
      via: 'deterministic' | 'ai';
    };

export type RouteResult =
  | {
      status: 'routed';
      route: RoutedPayload;
    }
  | {
      status: 'unresolved';
      reason:
        | 'deterministic-no-match'
        | 'deterministic-ambiguous'
        | 'ai-disabled'
        | 'ai-unavailable'
        | 'ai-low-confidence'
        | 'ai-unknown';
      detail: string;
    };

interface DeterministicCandidate {
  kind: RouteKind;
  confidence: number;
  extractedText: string;
}

const DEFAULT_AI_MIN_CONFIDENCE = 0.66;
const RULE_MIN_CONFIDENCE = 0.7;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function cleanExtractedValue(value: string): string {
  return value
    .trim()
    .replace(/^to\s+/i, '')
    .replace(/[.?!]\s*$/g, '')
    .trim();
}

function firstCapture(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  const raw = match?.[1];
  if (typeof raw !== 'string') {
    return null;
  }
  const cleaned = cleanExtractedValue(raw);
  return cleaned.length > 0 ? cleaned : null;
}

export function deterministicCandidates(text: string): DeterministicCandidate[] {
  const normalized = normalizeText(text);
  const candidates: DeterministicCandidate[] = [];

  const shoppingListItem = firstCapture(
    normalized,
    /\badd\s+(.+?)\s+to\s+(?:the\s+)?shopping\s+list\b/i,
  );
  if (shoppingListItem) {
    candidates.push({ kind: 'shopping', confidence: 0.97, extractedText: shoppingListItem });
  }

  const shoppingNeed = firstCapture(normalized, /^(?:we\s+need|get)\s+(.+)$/i);
  if (shoppingNeed) {
    candidates.push({ kind: 'shopping', confidence: 0.74, extractedText: shoppingNeed });
  }

  const reminderCommand = firstCapture(normalized, /\bremind\s+(?:us|me|everyone)\s+(.+)/i);
  if (reminderCommand) {
    candidates.push({ kind: 'reminder', confidence: 0.95, extractedText: reminderCommand });
  }

  const reminderSet = firstCapture(normalized, /\bset\s+(?:a\s+)?reminder(?:\s+to)?\s+(.+)/i);
  if (reminderSet) {
    candidates.push({ kind: 'reminder', confidence: 0.92, extractedText: reminderSet });
  }

  const choreExplicit = firstCapture(normalized, /\b(?:create|add|new)\s+chore\s+(.+)/i);
  if (choreExplicit) {
    candidates.push({ kind: 'chore', confidence: 0.94, extractedText: choreExplicit });
  }

  const choreImplicit = firstCapture(
    normalized,
    /\b(?:someone\s+needs\s+to|can\s+someone)\s+(.+)/i,
  );
  if (choreImplicit) {
    candidates.push({ kind: 'chore', confidence: 0.9, extractedText: choreImplicit });
  }

  const noteCommand = firstCapture(normalized, /\bnote\s+(?:that|down)\s+(.+)/i);
  if (noteCommand) {
    candidates.push({ kind: 'note', confidence: 0.95, extractedText: noteCommand });
  }

  const rememberCommand = firstCapture(normalized, /\bremember(?:\s+that)?\s+(.+)/i);
  if (rememberCommand) {
    candidates.push({ kind: 'note', confidence: 0.9, extractedText: rememberCommand });
  }

  return candidates;
}

export function chooseDeterministicRoute(
  candidates: DeterministicCandidate[],
  targetHint?: HouseholdVoiceCaptureCreated['targetHint'],
):
  | {
      route: DeterministicCandidate;
      ambiguous: false;
    }
  | {
      ambiguous: true;
      kinds: RouteKind[];
    }
  | null {
  if (candidates.length === 0) {
    return null;
  }

  const qualifying = candidates.filter((entry) => entry.confidence >= RULE_MIN_CONFIDENCE);
  if (qualifying.length === 0) {
    return null;
  }

  const [first] = qualifying;
  if (!first) {
    return null;
  }

  // Deterministic routing is ordered and first-match wins.
  // Only same-tier confidence collisions at the first tier use targetHint as a tiebreaker.
  const firstTier = qualifying.filter((entry) => entry.confidence === first.confidence);
  if (firstTier.length === 1) {
    return { route: first, ambiguous: false };
  }

  if (targetHint && targetHint !== 'unknown') {
    const matchedByHint = firstTier.filter((entry) => entry.kind === targetHint);
    if (matchedByHint.length === 1) {
      const selected = matchedByHint[0]!;
      return { route: selected, ambiguous: false };
    }
  }

  return {
    ambiguous: true,
    kinds: firstTier.map((entry) => entry.kind),
  };
}

function buildRoutedPayload(
  source: HouseholdVoiceCaptureCreated,
  kind: RouteKind,
  extractedText: string,
  confidence: number,
  via: 'deterministic' | 'ai',
): RoutedPayload {
  if (kind === 'shopping') {
    return {
      kind,
      topic: 'lifeos.household.shopping.item.add.requested',
      confidence,
      via,
      payload: {
        householdId: source.householdId,
        actorUserId: source.actorUserId,
        originalCaptureId: source.captureId,
        text: source.text,
        itemTitle: extractedText,
      },
    };
  }

  if (kind === 'reminder') {
    return {
      kind,
      topic: 'lifeos.household.reminder.create.requested',
      confidence,
      via,
      payload: {
        householdId: source.householdId,
        actorUserId: source.actorUserId,
        originalCaptureId: source.captureId,
        text: source.text,
        reminderText: extractedText,
      },
    };
  }

  if (kind === 'chore') {
    return {
      kind,
      topic: 'lifeos.household.chore.create.requested',
      confidence,
      via,
      payload: {
        householdId: source.householdId,
        actorUserId: source.actorUserId,
        originalCaptureId: source.captureId,
        text: source.text,
        choreTitle: extractedText,
      },
    };
  }

  return {
    kind,
    topic: 'lifeos.household.note.create.requested',
    confidence,
    via,
    payload: {
      householdId: source.householdId,
      actorUserId: source.actorUserId,
      originalCaptureId: source.captureId,
      text: source.text,
      noteBody: extractedText,
    },
  };
}

export async function routeHouseholdCapture(
  capture: HouseholdVoiceCaptureCreated,
  options: RouteOptions,
): Promise<RouteResult> {
  const candidates = deterministicCandidates(capture.text);
  const deterministic = chooseDeterministicRoute(candidates, capture.targetHint);

  if (deterministic?.ambiguous === false) {
    return {
      status: 'routed',
      route: buildRoutedPayload(
        capture,
        deterministic.route.kind,
        deterministic.route.extractedText,
        deterministic.route.confidence,
        'deterministic',
      ),
    };
  }

  if (!options.aiEnabled) {
    if (deterministic?.ambiguous) {
      return {
        status: 'unresolved',
        reason: 'deterministic-ambiguous',
        detail: `Deterministic routing tied between: ${deterministic.kinds.join(', ')}`,
      };
    }

    return {
      status: 'unresolved',
      reason: candidates.length === 0 ? 'deterministic-no-match' : 'ai-disabled',
      detail:
        candidates.length === 0
          ? 'No deterministic routing rule matched transcript.'
          : 'Deterministic confidence was below threshold and AI fallback is disabled.',
    };
  }

  const classifyWithAi = options.classifyWithAi;
  if (!classifyWithAi) {
    return {
      status: 'unresolved',
      reason: 'ai-unavailable',
      detail: 'AI fallback is enabled but no classifier is configured.',
    };
  }

  let aiResult: AiClassification;
  try {
    aiResult = await classifyWithAi(capture.text);
  } catch (error: unknown) {
    return {
      status: 'unresolved',
      reason: 'ai-unavailable',
      detail: error instanceof Error ? error.message : 'AI classifier call failed.',
    };
  }

  if (aiResult.kind === 'unknown') {
    return {
      status: 'unresolved',
      reason: 'ai-unknown',
      detail: 'AI classifier returned unknown intent.',
    };
  }

  const aiMinConfidence = options.aiMinimumConfidence ?? DEFAULT_AI_MIN_CONFIDENCE;
  if (aiResult.confidence < aiMinConfidence) {
    return {
      status: 'unresolved',
      reason: 'ai-low-confidence',
      detail: `AI confidence ${aiResult.confidence.toFixed(2)} below threshold ${aiMinConfidence.toFixed(2)}.`,
    };
  }

  const extracted = cleanExtractedValue(aiResult.extractedText ?? capture.text);
  return {
    status: 'routed',
    route: buildRoutedPayload(capture, aiResult.kind, extracted, aiResult.confidence, 'ai'),
  };
}
