import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';

export interface TickOverdueTask {
  id: string;
  title: string;
  planId?: string;
  dueDate: string;
}

export interface TickResult {
  now: string;
  checkedTasks: number;
  overdueTasks: TickOverdueTask[];
}

export interface RunTickOptions {
  graphPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  client?: Pick<LifeGraphClient, 'loadGraph'>;
  logger?: (message: string) => void;
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

export async function runTick(options: RunTickOptions = {}): Promise<TickResult> {
  const now = options.now ?? new Date();
  const client =
    options.client ??
    (() => {
      const clientOptions: Parameters<typeof createLifeGraphClient>[0] = {};
      if (options.graphPath) {
        clientOptions.graphPath = options.graphPath;
      }
      if (options.env) {
        clientOptions.env = options.env;
      }
      return createLifeGraphClient(clientOptions);
    })();

  const graph = await client.loadGraph();
  const overdueTasks: TickOverdueTask[] = [];
  let checkedTasks = 0;

  for (const action of graph.plannedActions ?? []) {
    checkedTasks += 1;
    if (action.status !== 'todo') {
      continue;
    }
    if (!isOverdue(action.dueDate, now)) {
      continue;
    }

    overdueTasks.push({
      id: action.id,
      title: action.title,
      dueDate: action.dueDate as string,
      ...(action.planId ? { planId: action.planId } : {}),
    });
  }

  if (options.logger && overdueTasks.length > 0) {
    options.logger(`[tick] ${overdueTasks.length} overdue planned action(s) detected`);
  }

  return {
    now: now.toISOString(),
    checkedTasks,
    overdueTasks,
  };
}
