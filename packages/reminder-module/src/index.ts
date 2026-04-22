import type { BaseEvent } from '@lifeos/event-bus';

import { Topics } from '@lifeos/contracts';

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
    dueDate: string;
  } & ({ planId?: string } | { goalTitle: string })>;
  tickedAt: string;
}

interface TaskScheduledPayload {
  taskId: string;
  planId: string;
  title: string;
  scheduledAt: string;
  origin?: string;
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

  await context.publish(
    Topics.lifeos.reminderSuggestionCreated,
    {
      overdueCount: event.data.overdueTasks.length,
      overdueTasks: event.data.overdueTasks,
      tickEventId: event.id,
      suggestedAt: new Date().toISOString(),
    },
    'reminder-module',
  );

  context.log(`[Reminder] Emitted suggestion event for ${event.data.overdueTasks.length} overdue tasks`);
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
