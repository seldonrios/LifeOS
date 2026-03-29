import chalk from 'chalk';
import Table from 'cli-table3';

import type {
  LifeGraphClient,
  LifeGraphDocument,
  LifeGraphReviewInsights,
  LifeGraphTask,
} from '@lifeos/life-graph';

export interface TaskListItem {
  id: string;
  shortId: string;
  title: string;
  goalTitle: string;
  status: LifeGraphTask['status'];
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

function statusColor(status: LifeGraphTask['status']): string {
  if (status === 'done') {
    return chalk.green(status);
  }
  if (status === 'in-progress') {
    return chalk.cyan(status);
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

export function flattenTasks(graph: LifeGraphDocument, now: Date = new Date()): TaskListItem[] {
  const rows: TaskListItem[] = [];

  for (const plan of graph.plans) {
    for (const task of plan.tasks) {
      rows.push({
        id: task.id,
        shortId: task.id.slice(0, 8),
        title: task.title,
        goalTitle: plan.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate ?? null,
        overdue: isOverdue(task.dueDate, now) && task.status !== 'done',
      });
    }
  }

  return rows.sort((left, right) => {
    if (left.status === 'done' && right.status !== 'done') {
      return 1;
    }
    if (right.status === 'done' && left.status !== 'done') {
      return -1;
    }
    if (left.overdue !== right.overdue) {
      return left.overdue ? -1 : 1;
    }
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    if (left.dueDate && right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate);
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
      chalk.cyan('Goal'),
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
      task.goalTitle,
      statusColor(task.status),
      priorityColor(task.priority),
      dueCell,
    ]);
  }

  return table.toString();
}

function findTaskMatch(
  graph: LifeGraphDocument,
  taskIdOrPrefix: string,
): {
  planIndex: number;
  taskIndex: number;
  task: LifeGraphTask;
  goalId: string;
  goalTitle: string;
} {
  const needle = taskIdOrPrefix.trim().toLowerCase();
  if (!needle) {
    throw new Error('Task ID is required for complete action.');
  }

  const matches: Array<{
    planIndex: number;
    taskIndex: number;
    task: LifeGraphTask;
    goalId: string;
    goalTitle: string;
  }> = [];
  graph.plans.forEach((plan, planIndex) => {
    plan.tasks.forEach((task, taskIndex) => {
      if (task.id.toLowerCase().startsWith(needle)) {
        matches.push({
          planIndex,
          taskIndex,
          task,
          goalId: plan.id,
          goalTitle: plan.title,
        });
      }
    });
  });

  if (matches.length === 0) {
    throw new Error(`Task "${taskIdOrPrefix}" not found.`);
  }

  if (matches.length > 1) {
    const ids = matches.map((match) => match.task.id.slice(0, 8)).join(', ');
    throw new Error(`Task ID prefix "${taskIdOrPrefix}" is ambiguous. Matches: ${ids}`);
  }

  return matches[0] as {
    planIndex: number;
    taskIndex: number;
    task: LifeGraphTask;
    goalId: string;
    goalTitle: string;
  };
}

function pickNextActionsFromGraph(graph: LifeGraphDocument, now: Date = new Date()): string[] {
  const tasks = flattenTasks(graph, now).filter((task) => task.status !== 'done');
  return tasks.slice(0, 3).map((task) => `${task.goalTitle}: ${task.title}`);
}

export async function handleTaskList(
  client: Pick<LifeGraphClient, 'loadGraph'>,
  options: TaskIoOptions,
): Promise<TaskListItem[]> {
  const graph = await client.loadGraph();
  const rows = flattenTasks(graph, options.now ?? new Date());

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
    'loadGraph' | 'saveGraph' | 'getPlannedAction' | 'updatePlannedAction'
  >,
  options: TaskIoOptions,
): Promise<{
  id: string;
  title: string;
  status: LifeGraphTask['status'];
  goalId?: string;
  goalTitle?: string;
  source: 'task' | 'planned-action';
  sourceCapture?: string;
}> {
  const graph = await client.loadGraph();

  try {
    const match = findTaskMatch(graph, taskId ?? '');

    const updatedTask: LifeGraphTask = {
      ...match.task,
      status: 'done',
    };

    const nextGraph: LifeGraphDocument = {
      ...graph,
      updatedAt: new Date().toISOString(),
      plans: graph.plans.map((plan, planIndex) => {
        if (planIndex !== match.planIndex) {
          return plan;
        }

        return {
          ...plan,
          tasks: plan.tasks.map((task, taskIndex) => {
            if (taskIndex !== match.taskIndex) {
              return task;
            }

            return updatedTask;
          }),
        };
      }),
    };

    await client.saveGraph(nextGraph);
    const payload = {
      id: updatedTask.id,
      title: updatedTask.title,
      goalId: match.goalId,
      goalTitle: match.goalTitle,
      status: updatedTask.status,
      source: 'task' as const,
    };

    if (options.outputJson) {
      options.stdout(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      options.stdout(
        chalk.green(`Task ${updatedTask.id.slice(0, 8)} completed: ${updatedTask.title}\n`),
      );
    }

    return payload;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedId = taskId?.trim() ?? '';
    if (!message.includes('not found') || normalizedId.length === 0) {
      throw error;
    }

    const plannedAction = await client.getPlannedAction(normalizedId);
    if (!plannedAction) {
      throw error;
    }

    await client.updatePlannedAction(plannedAction.id, {
      status: 'done',
      completedAt: new Date().toISOString(),
    });

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
  }
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

  const fallback = pickNextActionsFromGraph(await client.loadGraph(), options.now ?? new Date());
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
