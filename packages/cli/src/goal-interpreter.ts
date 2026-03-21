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
}

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
  const client = options.client ?? createDefaultClient(options.host);

  const response = await client.generate({
    model: options.model,
    prompt,
  });

  return parseGoalInterpretationPlan(response.response);
}
