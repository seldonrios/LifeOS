import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { GoalPlanSchema, type GoalPlan, type LifeGraphTask } from '@lifeos/life-graph';
import { Ollama } from 'ollama';

import {
  GOAL_DECOMPOSITION_USER_TEMPLATE,
  getGoalDecompositionSystemPrompt,
} from './prompts/goal-decomposition';

const MAX_RETRIES = 3;
const DEFAULT_MODEL = 'llama3.1:8b';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  format?: string | object;
  options?: {
    temperature?: number;
    num_ctx?: number;
  };
}

export interface OllamaChatResponse {
  message: {
    content: string;
  };
}

export interface OllamaChatClient {
  chat(request: OllamaChatRequest): Promise<OllamaChatResponse>;
}

export type InterpretGoalStage =
  | 'prompt_built'
  | 'llm_request_started'
  | 'llm_response_received'
  | 'plan_parse_started'
  | 'plan_parse_succeeded'
  | 'repair_prompt_built'
  | 'repair_request_started'
  | 'repair_response_received'
  | 'repair_parse_started'
  | 'repair_parse_succeeded';

export interface InterpretGoalOptions {
  model?: string;
  host?: string;
  now?: Date;
  client?: OllamaChatClient;
  onStage?: (stage: InterpretGoalStage) => void;
}

function createDefaultClient(host?: string): OllamaChatClient {
  return new Ollama(host ? { host } : undefined);
}

function parseCandidateJson(raw: string): unknown {
  return JSON.parse(raw);
}

function extractJsonFromFence(raw: string): string | null {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch?.[1]?.trim() ?? null;
}

function extractFirstJsonObject(raw: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

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
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

function sanitizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sanitizeTask(task: unknown, index: number): LifeGraphTask {
  const candidate = task && typeof task === 'object' ? (task as Record<string, unknown>) : {};
  const dueDate = sanitizeDateOnly(candidate.dueDate);
  const priorityValue = candidate.priority;
  const normalizedPriority =
    typeof priorityValue === 'number' && Number.isFinite(priorityValue)
      ? Math.min(5, Math.max(1, Math.trunc(priorityValue)))
      : 3;

  const normalized: LifeGraphTask = {
    id: sanitizeString(candidate.id) ?? `task_${randomUUID()}`,
    title:
      sanitizeString(candidate.title) ??
      sanitizeString(candidate.description) ??
      `Task ${index + 1}`,
    status: 'todo',
    priority: normalizedPriority,
  };

  if (dueDate) {
    normalized.dueDate = dueDate;
  }

  return normalized;
}

function normalizeGoalPlanInput(raw: unknown, goalText: string, now: Date): GoalPlan {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tasks = Array.isArray(candidate.tasks)
    ? candidate.tasks.map((task, index) => sanitizeTask(task, index))
    : [];

  const normalized: GoalPlan = {
    id: sanitizeString(candidate.id) ?? `goal_${randomUUID()}`,
    title: sanitizeString(candidate.title) ?? goalText.trim(),
    description:
      sanitizeString(candidate.description) ?? `Plan generated from goal: ${goalText.trim()}`,
    deadline: sanitizeDateOnly(candidate.deadline),
    tasks,
    createdAt: sanitizeString(candidate.createdAt) ?? now.toISOString(),
  };

  return GoalPlanSchema.parse(normalized) as GoalPlan;
}

function parseAndValidate(rawContent: string, goalText: string, now: Date): GoalPlan {
  const directCandidate = rawContent.trim();
  const candidates: string[] = [directCandidate];

  const fenced = extractJsonFromFence(directCandidate);
  if (fenced) {
    candidates.push(fenced);
  }

  const firstObject = extractFirstJsonObject(directCandidate);
  if (firstObject) {
    candidates.push(firstObject);
  }

  const seen = new Set<string>();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    try {
      const parsed = parseCandidateJson(candidate);
      return normalizeGoalPlanInput(parsed, goalText, now);
    } catch (error: unknown) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('Could not parse or repair JSON');
}

function buildRepairUserPrompt(
  goalText: string,
  previousOutput: string,
  errorMessage: string,
): string {
  return `${GOAL_DECOMPOSITION_USER_TEMPLATE(goalText)}

Your previous output failed validation.
Validation error: ${errorMessage}

Previous output:
${previousOutput}

Return ONLY corrected JSON that matches the required schema exactly.`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function isRecoverableParseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('json') ||
    message.includes('invalid') ||
    message.includes('parse') ||
    message.includes('validation')
  );
}

export async function interpretGoal(
  goalText: string,
  options: InterpretGoalOptions = {},
): Promise<GoalPlan> {
  const trimmedGoal = goalText.trim();
  if (!trimmedGoal) {
    throw new Error('Goal input cannot be empty.');
  }

  const now = options.now ?? new Date();
  const client = options.client ?? createDefaultClient(options.host);
  const model = options.model ?? DEFAULT_MODEL;
  let repairUserPrompt: string | null = null;
  let lastError: Error | null = null;
  let lastOutput = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const isRepairAttempt = attempt > 1;
    if (isRepairAttempt) {
      options.onStage?.('repair_prompt_built');
    } else {
      options.onStage?.('prompt_built');
    }

    const userPrompt = isRepairAttempt
      ? (repairUserPrompt ?? GOAL_DECOMPOSITION_USER_TEMPLATE(trimmedGoal))
      : GOAL_DECOMPOSITION_USER_TEMPLATE(trimmedGoal);

    if (isRepairAttempt) {
      options.onStage?.('repair_request_started');
    } else {
      options.onStage?.('llm_request_started');
    }

    let response: OllamaChatResponse;
    try {
      response = await client.chat({
        model,
        messages: [
          { role: 'system', content: getGoalDecompositionSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
        format: 'json',
        options: {
          temperature: 0.2,
          num_ctx: 8192,
        },
      });
    } catch (requestError: unknown) {
      lastError =
        requestError instanceof Error ? requestError : new Error(toErrorMessage(requestError));
      break;
    }

    const rawJson = response.message.content;
    lastOutput = rawJson;
    if (isRepairAttempt) {
      options.onStage?.('repair_response_received');
      options.onStage?.('repair_parse_started');
    } else {
      options.onStage?.('llm_response_received');
      options.onStage?.('plan_parse_started');
    }

    try {
      const validatedGoal = parseAndValidate(rawJson, trimmedGoal, now);
      if (isRepairAttempt) {
        options.onStage?.('repair_parse_succeeded');
      } else {
        options.onStage?.('plan_parse_succeeded');
      }
      return validatedGoal;
    } catch (parseError: unknown) {
      lastError = parseError instanceof Error ? parseError : new Error(toErrorMessage(parseError));
      if (!isRecoverableParseError(lastError)) {
        break;
      }
      repairUserPrompt = buildRepairUserPrompt(trimmedGoal, lastOutput, lastError.message);
      if (attempt < MAX_RETRIES) {
        await delay(300 * attempt);
      }
    }
  }

  throw new Error(
    `Goal interpretation failed after ${MAX_RETRIES} attempts: ${
      lastError?.message ?? 'unknown error'
    }`,
  );
}
