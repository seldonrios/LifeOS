import { Topics, type BaseEvent } from '@lifeos/event-bus';

import type { LifeGraphTask } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

interface TaskCompletedPayload {
  taskId: string;
  goalId: string;
  title: string;
  status: 'done';
  completedAt: string;
}

interface TickOverduePayload {
  checkedTasks: number;
  overdueTasks: Array<{
    id: string;
    title: string;
    goalTitle: string;
    dueDate: string;
  }>;
  tickedAt: string;
}

interface TaskScheduledPayload {
  taskId: string;
  planId: string;
  title: string;
  scheduledAt: string;
  origin?: string;
}

function buildFollowUpTasks(overdueTasks: TickOverduePayload['overdueTasks']): LifeGraphTask[] {
  return overdueTasks.slice(0, 3).map((task, index) => ({
    id: `reminder_task_${Date.now()}_${index}`,
    title: `Review overdue task: ${task.title}`,
    status: 'todo',
    priority: 4,
  }));
}

async function handleTaskCompleted(
  event: BaseEvent<TaskCompletedPayload>,
  context: ModuleRuntimeContext,
): Promise<void> {
  context.log(`[Reminder] Task completed: ${event.data.title}`);
}

async function handleTaskScheduled(
  event: BaseEvent<TaskScheduledPayload>,
  context: ModuleRuntimeContext,
): Promise<void> {
  context.log(
    `[Reminder] Tracking scheduled task ${event.data.taskId}: ${event.data.title} (${event.data.origin ?? 'unknown'})`,
  );
}

async function handleTickOverdue(
  event: BaseEvent<TickOverduePayload>,
  context: ModuleRuntimeContext,
): Promise<void> {
  if (event.data.overdueTasks.length === 0) {
    return;
  }

  const client = context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );

  const first = event.data.overdueTasks[0];
  const followUpTitle = `Overdue reminder: ${first?.title ?? 'Pending tasks'}`;
  const followUpId = await client.createNode('plan', {
    title: followUpTitle,
    description: `Auto-generated reminder for ${event.data.overdueTasks.length} overdue task(s).`,
    tasks: buildFollowUpTasks(event.data.overdueTasks),
  });

  await context.publish(
    Topics.lifeos.reminderFollowupCreated,
    {
      followUpPlanId: followUpId,
      overdueCount: event.data.overdueTasks.length,
      tickEventId: event.id,
      createdAt: new Date().toISOString(),
    },
    'reminder-module',
  );

  context.log(
    `[Reminder] Created follow-up plan ${followUpId} for ${event.data.overdueTasks.length} overdue tasks`,
  );
}

export function createReminderModule(): LifeOSModule {
  return {
    id: 'reminder',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<TaskScheduledPayload>(Topics.task.scheduled, async (event) => {
        await handleTaskScheduled(event, context);
      });

      await context.subscribe<TaskCompletedPayload>(Topics.lifeos.taskCompleted, async (event) => {
        await handleTaskCompleted(event, context);
      });

      await context.subscribe<TickOverduePayload>(Topics.lifeos.tickOverdue, async (event) => {
        await handleTickOverdue(event, context);
      });
    },
  };
}

export const reminderModule = createReminderModule();
