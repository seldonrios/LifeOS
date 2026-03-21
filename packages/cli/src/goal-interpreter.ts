import {
  GoalInterpretationPlanJsonSchema,
  GoalPlanParseError,
  buildGoalInterpretationPrompt,
  parseGoalInterpretationPlan,
  type GoalInterpretationPlan,
} from '@lifeos/goal-engine';
import { Ollama } from 'ollama';

export interface OllamaGenerateResponse {
  response: string;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  format?: string | object;
  options?: {
    temperature?: number;
  };
}

export interface OllamaClient {
  generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse>;
}

export interface InterpretGoalOptions {
  model: string;
  host?: string;
  now?: Date;
  client?: OllamaClient;
  onStage?: (stage: InterpretGoalStage) => void;
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

const DEFAULT_TEMPERATURE = 0.3;

function createDefaultClient(host?: string): OllamaClient {
  return new Ollama(host ? { host } : undefined);
}

function toParseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown parse error';
}

function buildRepairPrompt(
  rawInput: string,
  invalidOutput: string,
  errorMessage: string,
  now: Date,
): string {
  const basePrompt = buildGoalInterpretationPrompt(rawInput, now);
  return `
${basePrompt}

Your previous output was invalid for this schema.
Validation/parsing error:
${errorMessage}

Previous output:
${invalidOutput}

Return ONLY corrected JSON that matches the required schema exactly.
Do not include markdown, code fences, or explanation.
`.trim();
}

function buildGenerateRequest(model: string, prompt: string): OllamaGenerateRequest {
  return {
    model,
    prompt,
    format: GoalInterpretationPlanJsonSchema,
    options: {
      temperature: DEFAULT_TEMPERATURE,
    },
  };
}

export async function interpretGoal(
  rawInput: string,
  options: InterpretGoalOptions,
): Promise<GoalInterpretationPlan> {
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    throw new Error('Goal input cannot be empty.');
  }

  const now = options.now ?? new Date();
  const prompt = buildGoalInterpretationPrompt(trimmedInput, now);
  options.onStage?.('prompt_built');
  const client = options.client ?? createDefaultClient(options.host);

  options.onStage?.('llm_request_started');
  const response = await client.generate(buildGenerateRequest(options.model, prompt));
  options.onStage?.('llm_response_received');

  options.onStage?.('plan_parse_started');
  try {
    const parsed = parseGoalInterpretationPlan(response.response);
    options.onStage?.('plan_parse_succeeded');
    return parsed;
  } catch (firstError: unknown) {
    const errorMessage = toParseErrorMessage(firstError);
    const repairPrompt = buildRepairPrompt(trimmedInput, response.response, errorMessage, now);
    options.onStage?.('repair_prompt_built');
    options.onStage?.('repair_request_started');

    const repairedResponse = await client.generate(
      buildGenerateRequest(options.model, repairPrompt),
    );
    options.onStage?.('repair_response_received');
    options.onStage?.('repair_parse_started');

    try {
      const repaired = parseGoalInterpretationPlan(repairedResponse.response);
      options.onStage?.('repair_parse_succeeded');
      return repaired;
    } catch (secondError: unknown) {
      const secondErrorMessage = toParseErrorMessage(secondError);
      throw new GoalPlanParseError(
        `LLM output is not a valid MVP goal plan after repair attempt: ${secondErrorMessage}`,
        repairedResponse.response,
      );
    }
  }
}
