import chalk from 'chalk';
import Table from 'cli-table3';
import type { PlannedAction } from '@lifeos/contracts';

import type { LifeGraphClient, LifeGraphDocument, LifeGraphReviewInsights } from '@lifeos/life-graph';

export interface TaskListItem {
  id: string;
  shortId: string;
  title: string;
  planId?: string;
  status: PlannedAction['status'];
  priority: number;
  dueDate: string | null;
  overdue: boolean;
}

interface TaskIoOptions {
  outputJson: boolean;
  stdout: (message: string) => void;
  now?: Date;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isOverdue(dueDate: string | undefined, now: Date): boolean {
  if (!dueDate) {
    return false;
  }

  return dueDate < toDateOnly(now);
}

function statusColor(status: TaskListItem['status']): string {
  if (status === 'done') {
    return chalk.green(status);
  }
  if (status === 'blocked') {
    return chalk.red(status);
  }
  if (status === 'deferred') {
    return chalk.dim(status);
  }
  if (status === 'cancelled') {
    return chalk.strikethrough(chalk.gray(status));
  }

  return chalk.yellow(status);
}

function priorityColor(priority: number): string {
  if (priority >= 5) {
    return chalk.red(String(priority));
  }
  if (priority >= 4) {
    return chalk.yellow(String(priority));
  }

  return chalk.gray(String(priority));
}

export function flattenPlannedActions(
  graph: LifeGraphDocument,
  now: Date = new Date(),
): TaskListItem[] {
  const rows = (graph.plannedActions ?? [])
    .filter((action) => action.status !== 'done' && action.status !== 'cancelled')
    .map((action) => ({
      id: action.id,
      shortId: action.id.slice(0, 8),
      title: action.title,
      planId: action.planId,
      status: action.status,
      priority: 0,
      dueDate: action.dueDate ?? null,
      overdue: isOverdue(action.dueDate, now),
    }));

  return rows.sort((left, right) => {
    if (left.overdue !== right.overdue) {
      return left.overdue ? -1 : 1;
    }
    if (left.dueDate && right.dueDate) {
      const dueDateCompare = left.dueDate.localeCompare(right.dueDate);
      if (dueDateCompare !== 0) {
        return dueDateCompare;
      }
      return left.title.localeCompare(right.title);
    }
    if (left.dueDate && !right.dueDate) {
      return -1;
    }
    if (!left.dueDate && right.dueDate) {
      return 1;
    }
    return left.title.localeCompare(right.title);
  });
}

function renderTaskTable(rows: TaskListItem[]): string {
  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Task'),
      chalk.cyan('Plan'),
      chalk.cyan('Status'),
      chalk.cyan('Priority'),
      chalk.cyan('Due'),
    ],
    colWidths: [10, 34, 28, 14, 10, 14],
    wordWrap: true,
  });

  if (rows.length === 0) {
    table.push(['-', 'No tasks yet', '-', '-', '-', '-']);
    return table.toString();
  }

  for (const task of rows) {
    const dueCell = task.dueDate
      ? task.overdue
        ? chalk.red(task.dueDate)
        : chalk.gray(task.dueDate)
      : '-';
    table.push([
      task.shortId,
      task.title,
      task.planId ?? '-',
      statusColor(task.status),
      priorityColor(task.priority),
      dueCell,
    ]);
  }

  return table.toString();
}

function pickNextActionsFromPlannedActions(graph: LifeGraphDocument): string[] {
  const sorted = (graph.plannedActions ?? [])
    .filter((action) => action.status === 'todo')
    .sort((left, right) => {
      if (left.dueDate && right.dueDate) {
        const dueDateCompare = left.dueDate.localeCompare(right.dueDate);
        if (dueDateCompare !== 0) {
          return dueDateCompare;
        }
        return left.title.localeCompare(right.title);
      }
      if (left.dueDate && !right.dueDate) {
        return -1;
      }
      if (!left.dueDate && right.dueDate) {
        return 1;
      }
      return left.title.localeCompare(right.title);
    });

  return sorted.slice(0, 3).map((action) => action.title);
}

export async function handleTaskList(
  client: Pick<LifeGraphClient, 'loadGraph'>,
  options: TaskIoOptions,
): Promise<TaskListItem[]> {
  const graph = await client.loadGraph();
  const rows = flattenPlannedActions(graph, options.now ?? new Date());

  if (options.outputJson) {
    options.stdout(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    options.stdout(`${renderTaskTable(rows)}\n`);
  }

  return rows;
}

export async function handleTaskComplete(
  taskId: string | undefined,
  client: Pick<
    LifeGraphClient,
    'loadGraph' | 'getPlannedAction' | 'updatePlannedAction' | 'cancelRemindersForAction'
  >,
  options: TaskIoOptions,
): Promise<{
  id: string;
  title: string;
  status: PlannedAction['status'];
  goalId?: string;
  source: 'planned-action';
  sourceCapture?: string;
}> {
  const needle = (taskId ?? '').trim().toLowerCase();
  if (!needle) {
    throw new Error('Task ID is required for complete action.');
  }

  const completePlannedAction = async (plannedAction: PlannedAction) => {
    await client.updatePlannedAction(plannedAction.id, {
      status: 'done',
      completedAt: new Date().toISOString(),
    });
    await client.cancelRemindersForAction(plannedAction.id);

    const payload = {
      id: plannedAction.id,
      title: plannedAction.title,
      status: 'done' as const,
      source: 'planned-action' as const,
      ...(plannedAction.goalId ? { goalId: plannedAction.goalId } : {}),
      ...(plannedAction.sourceCapture ? { sourceCapture: plannedAction.sourceCapture } : {}),
    };

    if (options.outputJson) {
      options.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      options.stdout(
        chalk.green(
          `Planned action ${plannedAction.id.slice(0, 8)} completed: ${plannedAction.title}\n`,
        ),
      );
    }

    return payload;
  };

  const exactPlannedAction = await client.getPlannedAction(needle);
  if (exactPlannedAction) {
    return completePlannedAction(exactPlannedAction);
  }

  const graph = await client.loadGraph();
  const plannedActionMatches = (graph.plannedActions ?? []).filter((action) => {
    const normalizedActionId = action.id.toLowerCase();
    return normalizedActionId !== needle && normalizedActionId.startsWith(needle);
  });

  if (plannedActionMatches.length > 1) {
    const ids = plannedActionMatches.map((match) => match.id.slice(0, 8)).join(', ');
    throw new Error(`Task ID prefix "${taskId}" is ambiguous. Matches: ${ids}`);
  }

  if (plannedActionMatches.length === 1) {
    return completePlannedAction(plannedActionMatches[0] as PlannedAction);
  }

  throw new Error(`Task "${taskId}" not found.`);
}

async function resolvePlannedActionByIdOrPrefix(
  taskId: string | undefined,
  client: Pick<LifeGraphClient, 'getPlannedAction' | 'loadGraph'>,
): Promise<PlannedAction> {
  const needle = (taskId ?? '').trim().toLowerCase();
  if (!needle) {
    throw new Error('Task ID is required.');
  }

  const exactPlannedAction = await client.getPlannedAction(needle);
  if (exactPlannedAction) {
    return exactPlannedAction;
  }

  const graph = await client.loadGraph();
  const plannedActionMatches = (graph.plannedActions ?? []).filter((action) => {
    const normalizedActionId = action.id.toLowerCase();
    return normalizedActionId !== needle && normalizedActionId.startsWith(needle);
  });

  if (plannedActionMatches.length > 1) {
    const ids = plannedActionMatches.map((match) => match.id.slice(0, 8)).join(', ');
    throw new Error(`Task ID prefix "${taskId}" is ambiguous. Matches: ${ids}`);
  }

  const matched = plannedActionMatches[0];
  if (!matched) {
    throw new Error(`Task "${taskId}" not found.`);
  }

  return matched;
}

export async function handleTaskBlock(
  taskId: string | undefined,
  reason: string | undefined,
  client: Pick<LifeGraphClient, 'getPlannedAction' | 'loadGraph' | 'updatePlannedAction'>,
  options: TaskIoOptions,
): Promise<{ id: string; title: string; status: 'blocked'; blockedReason?: string }> {
  const plannedAction = await resolvePlannedActionByIdOrPrefix(taskId, client);
  const blockedReason = reason?.trim();
  const patch: Partial<PlannedAction> = {
    status: 'blocked',
    ...(blockedReason ? { blockedReason } : {}),
  };
  await client.updatePlannedAction(plannedAction.id, patch);

  const payload = {
    id: plannedAction.id,
    title: plannedAction.title,
    status: 'blocked' as const,
    ...(blockedReason ? { blockedReason } : {}),
  };

  if (options.outputJson) {
    options.stdout(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    options.stdout(chalk.green(`Planned action ${plannedAction.id.slice(0, 8)} blocked: ${plannedAction.title}\n`));
  }

  return payload;
}

export async function handleTaskCancel(
  taskId: string | undefined,
  client: Pick<
    LifeGraphClient,
    'getPlannedAction' | 'loadGraph' | 'updatePlannedAction' | 'cancelRemindersForAction'
  >,
  options: TaskIoOptions,
): Promise<{ id: string; title: string; status: 'cancelled' }> {
  const plannedAction = await resolvePlannedActionByIdOrPrefix(taskId, client);
  await client.updatePlannedAction(plannedAction.id, { status: 'cancelled' });
  await client.cancelRemindersForAction(plannedAction.id);

  const payload = {
    id: plannedAction.id,
    title: plannedAction.title,
    status: 'cancelled' as const,
  };

  if (options.outputJson) {
    options.stdout(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    options.stdout(chalk.green(`Planned action ${plannedAction.id.slice(0, 8)} cancelled: ${plannedAction.title}\n`));
  }

  return payload;
}

export async function handleTaskUnblock(
  taskId: string | undefined,
  client: Pick<LifeGraphClient, 'getPlannedAction' | 'loadGraph' | 'updatePlannedAction'>,
  options: TaskIoOptions,
): Promise<{ id: string; title: string; status: 'todo' }> {
  const plannedAction = await resolvePlannedActionByIdOrPrefix(taskId, client);

  if (plannedAction.status === 'blocked') {
    await client.updatePlannedAction(plannedAction.id, {
      status: 'todo',
      blockedReason: undefined,
    });
  } else if (plannedAction.status === 'deferred') {
    await client.updatePlannedAction(plannedAction.id, {
      status: 'todo',
      deferredUntil: undefined,
    });
  } else {
    throw new Error('Action is not blocked or deferred.');
  }

  const payload = {
    id: plannedAction.id,
    title: plannedAction.title,
    status: 'todo' as const,
  };

  if (options.outputJson) {
    options.stdout(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    options.stdout(chalk.green(`Planned action ${plannedAction.id.slice(0, 8)} unblocked: ${plannedAction.title}\n`));
  }

  return payload;
}

export async function handleNextActions(
  client: Pick<LifeGraphClient, 'generateReview' | 'loadGraph'>,
  options: TaskIoOptions,
): Promise<{ nextActions: string[]; source: LifeGraphReviewInsights['source'] }> {
  let review: LifeGraphReviewInsights | null = null;
  try {
    review = await client.generateReview('daily');
  } catch {
    review = null;
  }

  const fallback = pickNextActionsFromPlannedActions(await client.loadGraph());
  const nextActions = review?.nextActions.length
    ? review.nextActions.slice(0, 3)
    : fallback.slice(0, 3);
  const source = review?.nextActions.length ? review.source : 'heuristic';

  if (options.outputJson) {
    options.stdout(
      `${JSON.stringify(
        {
          nextActions,
          source,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const lines = ['Top Next Actions:'];
    if (nextActions.length === 0) {
      lines.push('- none yet, create a goal and LifeOS will suggest your best next move');
    } else {
      nextActions.forEach((action) => {
        lines.push(`- ${action}`);
      });
    }
    lines.push(`source=${source}`);
    options.stdout(`${lines.join('\n')}\n`);
  }

  return { nextActions, source };
}
