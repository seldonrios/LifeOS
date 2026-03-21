import {
  buildGoalInterpretationPrompt,
  parseGoalInterpretationPlan,
  type GoalInterpretationPlan,
} from '@lifeos/goal-engine';
import { Ollama } from 'ollama';

export interface OllamaGenerateResponse {
  response: string;
}

export interface OllamaClient {
  generate(request: { model: string; prompt: string }): Promise<OllamaGenerateResponse>;
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
  | 'plan_parse_succeeded';

function createDefaultClient(host?: string): OllamaClient {
  return new Ollama(host ? { host } : undefined);
}

export async function interpretGoal(
  rawInput: string,
  options: InterpretGoalOptions,
): Promise<GoalInterpretationPlan> {
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    throw new Error('Goal input cannot be empty.');
  }

  const prompt = buildGoalInterpretationPrompt(trimmedInput, options.now ?? new Date());
  options.onStage?.('prompt_built');
  const client = options.client ?? createDefaultClient(options.host);

  options.onStage?.('llm_request_started');
  const response = await client.generate({
    model: options.model,
    prompt,
  });
  options.onStage?.('llm_response_received');

  options.onStage?.('plan_parse_started');
  const plan = parseGoalInterpretationPlan(response.response);
  options.onStage?.('plan_parse_succeeded');
  return plan;
}
