import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';

export interface TickOverdueTask {
  id: string;
  title: string;
  goalTitle: string;
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

  for (const plan of graph.plans) {
    for (const task of plan.tasks) {
      checkedTasks += 1;
      if (task.status === 'done') {
        continue;
      }
      if (!isOverdue(task.dueDate, now)) {
        continue;
      }

      overdueTasks.push({
        id: task.id,
        title: task.title,
        goalTitle: plan.title,
        dueDate: task.dueDate as string,
      });
    }
  }

  if (options.logger && overdueTasks.length > 0) {
    options.logger(`[tick] ${overdueTasks.length} overdue task(s) detected`);
  }

  return {
    now: now.toISOString(),
    checkedTasks,
    overdueTasks,
  };
}
