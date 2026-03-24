import { createHash } from 'node:crypto';

import type { GoalPlan, LifeGraphClient, LifeGraphTask } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const GOOGLE_TASKLISTS_ENDPOINT = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists';
const GOOGLE_TASKS_ENDPOINT = 'https://tasks.googleapis.com/tasks/v1/lists';
const GOOGLE_TASKS_PLAN_ID = 'goal_google_tasks_sync';
const MAX_SYNCED_TASKS = 400;

interface GoogleTaskList {
  id?: string;
  title?: string;
}

interface GoogleTaskListsResponse {
  items?: GoogleTaskList[];
}

interface GoogleTask {
  id?: string;
  title?: string;
  status?: string;
  due?: string;
}

interface GoogleTasksResponse {
  items?: GoogleTask[];
}

interface GoogleTaskCreateResponse {
  id?: string;
  title?: string;
  due?: string;
}

function stableId(seed: string): string {
  return createHash('sha1').update(seed).digest('hex').slice(0, 24);
}

function toDateOnly(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString().slice(0, 10);
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toGoogleTaskDueDate(value: unknown): string | undefined {
  const candidate = getString(value);
  if (!candidate) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return `${candidate}T09:00:00.000Z`;
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function toTask(item: GoogleTask): LifeGraphTask | null {
  if (!item.id || !item.title) {
    return null;
  }
  const status = item.status === 'completed' ? 'done' : 'todo';
  const task: LifeGraphTask = {
    id: `task_${stableId(`google-task:${item.id}`)}`,
    title: item.title.trim().slice(0, 200) || 'Google Task',
    status,
    priority: 3,
  };
  const dueDate = toDateOnly(item.due);
  if (dueDate) {
    task.dueDate = dueDate;
  }
  if (status !== 'done') {
    task.voiceTriggered = false;
  }
  return task;
}

function pickTaskList(taskLists: GoogleTaskList[]): GoogleTaskList | null {
  if (taskLists.length === 0) {
    return null;
  }
  const myTasks = taskLists.find(
    (list) => list.title?.toLowerCase().includes('my tasks') && Boolean(list.id),
  );
  if (myTasks) {
    return myTasks;
  }
  return taskLists.find((list) => Boolean(list.id)) ?? null;
}

function mergeTasksPlan(
  graphPlans: GoalPlan[],
  tasks: LifeGraphTask[],
  nowIso: string,
): GoalPlan[] {
  const existing = graphPlans.find((plan) => plan.id === GOOGLE_TASKS_PLAN_ID);
  const plan: GoalPlan = {
    id: GOOGLE_TASKS_PLAN_ID,
    title: 'Google Tasks',
    description: 'Tasks synchronized from Google Tasks via google-bridge.',
    deadline: null,
    createdAt: existing?.createdAt ?? nowIso,
    tasks,
  };
  const withoutExisting = graphPlans.filter((item) => item.id !== GOOGLE_TASKS_PLAN_ID);
  return [...withoutExisting, plan];
}

export async function syncGoogleTasks(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const listsResponse = await fetch(`${GOOGLE_TASKLISTS_ENDPOINT}?maxResults=20`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!listsResponse.ok) {
    const body = await listsResponse.text();
    throw new Error(
      `Google Tasks list request failed (${listsResponse.status}): ${body.slice(0, 240)}`,
    );
  }
  const listsPayload = (await listsResponse.json()) as GoogleTaskListsResponse;
  const taskList = pickTaskList(listsPayload.items ?? []);
  if (!taskList?.id) {
    await context.publish(
      'lifeos.bridge.google.tasks.updated',
      {
        count: 0,
        syncedAt: new Date().toISOString(),
      },
      'google-bridge',
    );
    return 0;
  }

  const tasksResponse = await fetch(
    `${GOOGLE_TASKS_ENDPOINT}/${encodeURIComponent(taskList.id)}/tasks?showCompleted=true&maxResults=200`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!tasksResponse.ok) {
    const body = await tasksResponse.text();
    throw new Error(`Google Tasks request failed (${tasksResponse.status}): ${body.slice(0, 240)}`);
  }

  const tasksPayload = (await tasksResponse.json()) as GoogleTasksResponse;
  const tasks = (tasksPayload.items ?? [])
    .map((item) => toTask(item))
    .filter((task): task is LifeGraphTask => task !== null)
    .slice(0, MAX_SYNCED_TASKS);

  const graph = await client.loadGraph();
  const nowIso = new Date().toISOString();
  await client.saveGraph({
    ...graph,
    updatedAt: nowIso,
    plans: mergeTasksPlan(graph.plans, tasks, nowIso),
  });

  await context.publish(
    'lifeos.bridge.google.tasks.updated',
    {
      count: tasks.length,
      taskList: taskList.title ?? 'Google Tasks',
      syncedAt: nowIso,
    },
    'google-bridge',
  );

  return tasks.length;
}

export async function createGoogleTaskFromVoice(
  context: ModuleRuntimeContext,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ googleTaskId: string; title: string; due?: string } | null> {
  const title = (getString(payload.taskTitle) ?? getString(payload.title) ?? '').slice(0, 200);
  if (!title) {
    return null;
  }

  const listsResponse = await fetch(`${GOOGLE_TASKLISTS_ENDPOINT}?maxResults=20`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!listsResponse.ok) {
    const body = await listsResponse.text();
    throw new Error(
      `Google Tasks list request failed (${listsResponse.status}): ${body.slice(0, 240)}`,
    );
  }
  const listsPayload = (await listsResponse.json()) as GoogleTaskListsResponse;
  const taskList = pickTaskList(listsPayload.items ?? []);
  if (!taskList?.id) {
    return null;
  }

  const due = toGoogleTaskDueDate(payload.dueDate ?? payload.due);
  const createResponse = await fetch(
    `${GOOGLE_TASKS_ENDPOINT}/${encodeURIComponent(taskList.id)}/tasks`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title,
        ...(due ? { due } : {}),
      }),
    },
  );
  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Google Tasks create failed (${createResponse.status}): ${body.slice(0, 240)}`);
  }
  const created = (await createResponse.json()) as GoogleTaskCreateResponse;
  const googleTaskId = getString(created.id) ?? '';
  if (!googleTaskId) {
    return null;
  }

  const result: { googleTaskId: string; title: string; due?: string } = {
    googleTaskId,
    title: getString(created.title) ?? title,
  };
  const createdDue = getString(created.due) ?? due;
  if (createdDue) {
    result.due = createdDue;
  }

  await context.publish('lifeos.bridge.google.tasks.created', result, 'google-bridge');
  return result;
}
