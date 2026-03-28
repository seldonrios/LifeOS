import { Topics, type LifeOSModule } from '@lifeos/module-sdk';

interface PlanningAssistantConfig {
  maxTasksPerTick: number;
  reminderLeadMinutes: number;
}

const DEFAULT_CONFIG: PlanningAssistantConfig = {
  maxTasksPerTick: 3,
  reminderLeadMinutes: 15,
};

export const planningAssistantConfigSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    maxTasksPerTick: {
      type: 'number',
      minimum: 1,
      maximum: 10,
    },
    reminderLeadMinutes: {
      type: 'number',
      minimum: 1,
      maximum: 120,
    },
  },
} as const;

function loadConfig(env: NodeJS.ProcessEnv): PlanningAssistantConfig {
  const maxTasksRaw = Number(env.LIFEOS_PLANNING_ASSISTANT_MAX_TASKS ?? DEFAULT_CONFIG.maxTasksPerTick);
  const leadRaw = Number(env.LIFEOS_PLANNING_ASSISTANT_REMINDER_LEAD_MINUTES ?? DEFAULT_CONFIG.reminderLeadMinutes);

  return {
    maxTasksPerTick: Number.isFinite(maxTasksRaw) && maxTasksRaw > 0 ? Math.trunc(maxTasksRaw) : DEFAULT_CONFIG.maxTasksPerTick,
    reminderLeadMinutes: Number.isFinite(leadRaw) && leadRaw > 0 ? Math.trunc(leadRaw) : DEFAULT_CONFIG.reminderLeadMinutes,
  };
}

export const planningAssistantModule: LifeOSModule = {
  id: 'planning-assistant',
  async init(context) {
    const config = loadConfig(context.env);
    const graph = context.createLifeGraphClient(
      context.graphPath
        ? {
            env: context.env,
            graphPath: context.graphPath,
          }
        : {
            env: context.env,
          },
    );

    await context.subscribe(Topics.lifeos.tickOverdue, async () => {
      const current = await graph.loadGraph();
      const openTasks = current.plans.flatMap((plan) =>
        plan.tasks.filter((task) => task.status !== 'done').slice(0, config.maxTasksPerTick),
      );

      for (const task of openTasks) {
        await context.publish(
          Topics.lifeos.planningAssistantTaskPlanned,
          {
            taskId: task.id,
            title: task.title,
            reminderLeadMinutes: config.reminderLeadMinutes,
          },
          'planning-assistant',
        );
      }

      await context.publish(
        Topics.lifeos.planningAssistantReminderScheduled,
        {
          count: openTasks.length,
          at: new Date().toISOString(),
        },
        'planning-assistant',
      );
    });

    await context.subscribe(Topics.lifeos.taskCompleted, async (event) => {
      const graphDoc = await graph.loadGraph();
      graphDoc.updatedAt = new Date().toISOString();
      await graph.saveGraph(graphDoc);

      await context.publish(
        Topics.lifeos.planningAssistantPlanUpdated,
        {
          completedTask: event.data,
          updatedAt: graphDoc.updatedAt,
        },
        'planning-assistant',
      );
    });
  },
};
