import { z } from 'zod';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [yearPart, monthPart, dayPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const GoalPlanSubtaskSchema = z
  .object({
    description: z.string().trim().min(1),
    dependsOn: z.array(z.string().trim().min(1)),
    estimatedHours: z.number().finite().min(0),
  })
  .strict();

export const GoalInterpretationPlanSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    priority: z.enum(['high', 'medium', 'low']),
    deadline: z.union([
      z.null(),
      z
        .string()
        .regex(DATE_PATTERN)
        .refine((value) => isValidIsoDate(value), 'deadline must be a real calendar date'),
    ]),
    subtasks: z.array(GoalPlanSubtaskSchema),
    neededResources: z.array(z.string().trim().min(1)),
    relatedAreas: z.array(z.string().trim().min(1)),
  })
  .strict();

export type GoalPlanSubtask = z.infer<typeof GoalPlanSubtaskSchema>;
export type GoalInterpretationPlan = z.infer<typeof GoalInterpretationPlanSchema>;

export class GoalPlanParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: string,
  ) {
    super(message);
    this.name = 'GoalPlanParseError';
  }
}

function extractJsonCodeFence(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch?.[1]?.trim() ?? null;
}

function extractFirstJsonObject(text: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseCandidate(candidate: string): unknown {
  return JSON.parse(candidate);
}

export function validateGoalInterpretationPlan(input: unknown): GoalInterpretationPlan {
  return GoalInterpretationPlanSchema.parse(input);
}

export function parseGoalInterpretationPlan(rawOutput: string): GoalInterpretationPlan {
  const normalized = rawOutput.trim();
  const candidates = [normalized];

  const fencedJson = extractJsonCodeFence(normalized);
  if (fencedJson) {
    candidates.push(fencedJson);
  }

  const embeddedJson = extractFirstJsonObject(normalized);
  if (embeddedJson) {
    candidates.push(embeddedJson);
  }

  const seen = new Set<string>();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    try {
      return validateGoalInterpretationPlan(parseCandidate(candidate));
    } catch (error) {
      lastError = error;
    }
  }

  const errorMessage =
    lastError instanceof Error ? lastError.message : 'invalid JSON output from model';
  throw new GoalPlanParseError(
    `LLM output is not a valid MVP goal plan: ${errorMessage}`,
    rawOutput,
  );
}

export function buildGoalInterpretationPrompt(rawInput: string, now: Date = new Date()): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const localTimestamp = now.toLocaleString('en-US', {
    hour12: false,
    timeZoneName: 'short',
  });
  const isoDate = now.toISOString().slice(0, 10);

  return `
You are the LifeOS goal interpreter.

Current local date/time: ${localTimestamp}
Current timezone: ${timezone}
Current date (YYYY-MM-DD): ${isoDate}

User input:
"${rawInput.trim()}"

Return a structured plan JSON object with this exact shape:
{
  "title": string,
  "description": string,
  "priority": "high" | "medium" | "low",
  "deadline": "YYYY-MM-DD" | null,
  "subtasks": [
    {
      "description": string,
      "dependsOn": string[],
      "estimatedHours": number
    }
  ],
  "neededResources": string[],
  "relatedAreas": string[]
}

Rules:
- Output ONLY valid JSON.
- Do not include markdown, code fences, or explanations.
- If deadline is unknown, use null.
- If a date is provided, format as YYYY-MM-DD.
`.trim();
}
