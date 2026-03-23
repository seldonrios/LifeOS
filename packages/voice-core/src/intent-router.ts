import { randomUUID } from 'node:crypto';

import { Topics } from '@lifeos/event-bus';
import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';

export interface IntentOutcome {
  handled: boolean;
  action: 'task_added' | 'next_actions' | 'time_reported' | 'agent_work_requested' | 'unhandled';
  responseText: string;
  planId?: string;
  taskId?: string;
}

export type VoiceEventPublisher = (
  topic: string,
  data: Record<string, unknown>,
  source?: string,
) => Promise<void>;

export interface IntentRouterOptions {
  env?: NodeJS.ProcessEnv;
  graphPath?: string;
  client?: LifeGraphClient;
  createLifeGraphClient?: typeof createLifeGraphClient;
  publish?: VoiceEventPublisher;
  now?: () => Date;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/[.?!]+$/g, '');
  if (!trimmed) {
    return 'Untitled task';
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function extractTaskTitle(text: string): string | null {
  const normalized = text.trim();
  const patterns = [
    /^add(?: me)?(?: an?| another)? task(?: to)?\s+(.+)$/i,
    /^remind me to\s+(.+)$/i,
    /^remember to\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return sentenceCase(candidate);
    }
  }

  return null;
}

async function noopPublish(): Promise<void> {
  return;
}

export class IntentRouter {
  private readonly client: LifeGraphClient;
  private readonly publish: VoiceEventPublisher;
  private readonly now: () => Date;

  constructor(options: IntentRouterOptions = {}) {
    const createClient = options.createLifeGraphClient ?? createLifeGraphClient;
    const clientOptions: Parameters<typeof createLifeGraphClient>[0] = {};
    if (options.env) {
      clientOptions.env = options.env;
    }
    if (options.graphPath) {
      clientOptions.graphPath = options.graphPath;
    }
    this.client = options.client ?? createClient(clientOptions);
    this.publish = options.publish ?? noopPublish;
    this.now = options.now ?? (() => new Date());
  }

  async handleCommand(text: string): Promise<IntentOutcome> {
    const taskTitle = extractTaskTitle(text);
    if (taskTitle) {
      return this.handleTaskIntent(text, taskTitle);
    }

    const lower = text.toLowerCase();
    if (
      lower.includes("what's next") ||
      lower.includes('what is next') ||
      lower.includes('next task')
    ) {
      const review = await this.client.generateReview('daily');
      const firstAction = review.nextActions[0] ?? 'You do not have any queued next actions.';
      const responseText =
        review.nextActions.length > 0 ? `Your next action is ${firstAction}.` : firstAction;

      await this.publish(
        Topics.lifeos.voiceCommandProcessed,
        {
          action: 'next_actions',
          text,
          responseText,
        },
        'voice-core',
      );

      return {
        handled: true,
        action: 'next_actions',
        responseText,
      };
    }

    if (
      lower.includes('what time is it') ||
      lower.includes("what's the time") ||
      lower === 'time' ||
      lower.includes('current time')
    ) {
      const timeIso = this.now().toISOString();
      const responseText = `Current local time snapshot: ${timeIso}.`;
      await this.publish(
        Topics.lifeos.voiceCommandProcessed,
        {
          action: 'time_reported',
          text,
          responseText,
          at: timeIso,
        },
        'voice-core',
      );
      return {
        handled: true,
        action: 'time_reported',
        responseText,
      };
    }

    if (
      lower.includes('calendar') ||
      lower.includes('schedule') ||
      lower.includes('note') ||
      lower.includes('research')
    ) {
      const inferredIntent =
        lower.includes('calendar') || lower.includes('schedule')
          ? 'calendar'
          : lower.includes('note')
            ? 'notes'
            : 'research';
      await this.publish(
        Topics.agent.workRequested,
        {
          utterance: text,
          intent: inferredIntent,
          requestedAt: this.now().toISOString(),
          origin: 'voice-core',
        },
        'voice-core',
      );
      const responseText = `Queued that for the ${inferredIntent} flow.`;
      await this.publish(
        Topics.lifeos.voiceCommandProcessed,
        {
          action: 'agent_work_requested',
          text,
          responseText,
          intent: inferredIntent,
        },
        'voice-core',
      );
      return {
        handled: true,
        action: 'agent_work_requested',
        responseText,
      };
    }

    await this.publish(
      Topics.lifeos.voiceCommandUnhandled,
      {
        text,
      },
      'voice-core',
    );

    return {
      handled: false,
      action: 'unhandled',
      responseText: 'I heard you, but I do not know how to do that yet.',
    };
  }

  private async handleTaskIntent(text: string, taskTitle: string): Promise<IntentOutcome> {
    const createdAt = this.now().toISOString();
    const planId = `goal_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const planTitle = `Voice task: ${taskTitle}`;

    await this.client.createNode('plan', {
      id: planId,
      createdAt,
      title: planTitle,
      description: `Created from voice command: "${text}"`,
      tasks: [
        {
          id: taskId,
          title: taskTitle,
          status: 'todo',
          priority: 4,
        },
      ],
    });

    await this.publish(
      Topics.plan.created,
      {
        planId,
        title: planTitle,
        createdAt,
        origin: 'voice',
      },
      'voice-core',
    );
    await this.publish(
      Topics.task.scheduled,
      {
        taskId,
        planId,
        title: taskTitle,
        scheduledAt: createdAt,
        origin: 'voice',
      },
      'voice-core',
    );
    await this.publish(
      Topics.lifeos.voiceCommandProcessed,
      {
        action: 'task_added',
        text,
        planId,
        taskId,
      },
      'voice-core',
    );

    return {
      handled: true,
      action: 'task_added',
      responseText: `Added a task to ${taskTitle}.`,
      planId,
      taskId,
    };
  }
}
