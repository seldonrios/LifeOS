export interface FriendlyCliError {
  message: string;
  guidance?: string;
}

export interface FriendlyCliErrorContext {
  command?: string;
  graphPath?: string;
  model?: string;
}

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error.';
}

export function toFriendlyCliError(
  error: unknown,
  context: FriendlyCliErrorContext = {},
): FriendlyCliError {
  const message = normalizeErrorMessage(error);
  const model = context.model ?? 'llama3.1:8b';
  const graphPath = context.graphPath;

  if (
    /fetch failed|econnrefused|enotfound|connect econn|network error|connection refused/i.test(
      message,
    )
  ) {
    if (/nats/i.test(message) || context.command === 'events' || context.command === 'tick') {
      return {
        message: 'NATS is not reachable. Event streaming is unavailable.',
        guidance:
          'Quick fix:\n  docker compose up -d nats\nIf NATS stays unavailable, local in-memory fallback remains active for supported flows.',
      };
    }

    return {
      message: 'Ollama is not reachable.',
      guidance: ['Quick fix:', '  ollama serve', `  ollama pull ${model}`].join('\n'),
    };
  }

  if (/model.+not found|try pulling/i.test(message)) {
    return {
      message: `Model "${model}" is not available in Ollama.`,
      guidance: `Run:\n  ollama pull ${model}`,
    };
  }

  if (/failed after 3 attempts|could not parse or repair json/i.test(message)) {
    return {
      message: 'Model output did not match the expected goal-plan schema.',
      guidance:
        'Try re-running with a clearer goal statement. Use --verbose to inspect safe parse diagnostics.',
    };
  }

  if (/enoent|no such file or directory/i.test(message) && graphPath) {
    return {
      message: `Life graph not found at "${graphPath}".`,
      guidance: 'Create it with:\n  lifeos goal "Plan my week"',
    };
  }

  if (
    /invalid life graph|life graph.+zod|zod.+life graph|graph.+schema/i.test(message) &&
    graphPath
  ) {
    return {
      message: 'Life graph file is corrupted or has an incompatible schema.',
      guidance: `Review or restore the graph file at:\n  ${graphPath}`,
    };
  }

  return { message };
}
