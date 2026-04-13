import { writeFile } from 'node:fs/promises';
import { graphManager } from './manager';
import { getDefaultLifeGraphPath, resolveLifeGraphPath } from './path';
function toLegacyRecord(plan) {
    return {
        id: plan.id,
        createdAt: plan.createdAt,
        input: plan.title,
        plan: plan,
    };
}
export { getDefaultLifeGraphPath };
const DEFAULT_SCHEMA_VERSION = '2.0.0';
function buildMigrationSteps(currentVersion, targetVersion) {
    if (currentVersion === targetVersion) {
        return [];
    }
    const steps = [];
    steps.push(`Validate current graph compatibility from ${currentVersion}.`);
    if (currentVersion === '1.0.0' && targetVersion === '2.0.0') {
        steps.push('Initialize system.meta.schemaVersion and migration history metadata.');
    }
    else {
        steps.push(`Apply schema metadata migration to ${targetVersion}.`);
    }
    return steps;
}
export async function runGraphMigrations(graphPath, options = {}) {
    const targetVersion = options.targetVersion?.trim() || DEFAULT_SCHEMA_VERSION;
    const graph = await graphManager.load(graphPath);
    const currentVersion = graph.system?.meta?.schemaVersion ?? '1.0.0';
    const steps = buildMigrationSteps(currentVersion, targetVersion);
    const dryRun = options.dryRun === true;
    if (steps.length === 0) {
        return {
            currentVersion,
            targetVersion,
            migrated: false,
            dryRun,
            steps,
        };
    }
    const nowIso = new Date().toISOString();
    const nextGraph = {
        ...graph,
        updatedAt: nowIso,
        system: {
            ...(graph.system ?? {}),
            meta: {
                ...(graph.system?.meta ?? {}),
                schemaVersion: targetVersion,
                migrationHistory: [
                    ...(graph.system?.meta?.migrationHistory ?? []).slice(-49),
                    {
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        appliedAt: nowIso,
                        description: `Automatic graph migration ${currentVersion} -> ${targetVersion}`,
                    },
                ],
            },
        },
    };
    if (dryRun) {
        return {
            currentVersion,
            targetVersion,
            migrated: true,
            dryRun,
            steps,
        };
    }
    const resolvedGraphPath = resolveLifeGraphPath(graphPath);
    const backupPath = `${resolvedGraphPath}.backup-${Date.now()}.json`;
    await writeFile(backupPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
    await graphManager.save(nextGraph, graphPath);
    return {
        currentVersion,
        targetVersion,
        migrated: true,
        dryRun,
        backupPath,
        steps,
    };
}
export async function loadGraph(graphPath) {
    return graphManager.load(graphPath);
}
export async function saveGraphAtomic(graph, graphPath) {
    await graphManager.save(graph, graphPath);
}
export async function appendGoalPlan(input, graphPath) {
    const { record } = await graphManager.appendPlan(input, graphPath);
    return record;
}
export async function getGraphSummary(graphPath) {
    const graph = await loadGraph(graphPath);
    const sortedPlans = [...graph.plans].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestPlanCreatedAt = sortedPlans[0]?.createdAt ?? null;
    const recentPlanTitles = [...graph.plans]
        .slice(-3)
        .reverse()
        .map((plan) => plan.title);
    const activeGoals = graph.plans
        .map((plan) => {
        const totalTasks = plan.tasks.length;
        const completedTasks = plan.tasks.filter((task) => task.status === 'done').length;
        const priority = plan.tasks.reduce((max, task) => Math.max(max, task.priority), 3);
        return {
            id: plan.id,
            title: plan.title,
            totalTasks,
            completedTasks,
            priority,
            deadline: plan.deadline,
        };
    })
        .filter((goal) => goal.totalTasks === 0 || goal.completedTasks < goal.totalTasks);
    return {
        version: graph.version,
        totalPlans: graph.plans.length,
        totalGoals: graph.plans.length,
        updatedAt: graph.updatedAt,
        latestPlanCreatedAt,
        latestGoalCreatedAt: latestPlanCreatedAt,
        recentPlanTitles,
        recentGoalTitles: recentPlanTitles,
        activeGoals,
    };
}
export async function getGraphStorageInfo(graphPath) {
    return graphManager.getStorageInfo(graphPath);
}
export async function loadLocalLifeGraph(graphPath) {
    const graph = await loadGraph(graphPath);
    return {
        goals: graph.plans.map((plan) => toLegacyRecord(plan)),
    };
}
export async function appendGoalPlanRecord(entry, graphPath) {
    return appendGoalPlan(entry, graphPath);
}
