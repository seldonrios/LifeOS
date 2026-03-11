import type { EventBus, BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';

export enum ModuleCategory {
  health = 'health',
  production = 'production',
  economics = 'economics',
  hobby = 'hobby',
  automation = 'automation',
  learning = 'learning',
  community = 'community',
}

export enum ModulePermission {
  LifeGraphRead = 'life_graph_read',
  LifeGraphWrite = 'life_graph_write',
  CalendarRead = 'calendar_read',
  CalendarWrite = 'calendar_write',
  EventPublish = 'event_publish',
  EventSubscribe = 'event_subscribe',
  DeviceControl = 'device_control',
  LlmInvoke = 'llm_invoke',
  NotificationSend = 'notification_send',
}

export interface ModuleMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  category: ModuleCategory;
  author?: string;
  permissions: ModulePermission[];
}

export interface SchedulerAPI {
  schedule(taskId: string, at: string): Promise<void>;
}

export interface DeviceAPI {
  invoke(deviceId: string, action: string, payload?: Record<string, unknown>): Promise<void>;
}

export interface LLMClient {
  complete(prompt: string, context?: Record<string, unknown>): Promise<string>;
}

export interface ModuleStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
}

export interface ModuleContext {
  graph: LifeGraphClient;
  events: EventBus;
  scheduler: SchedulerAPI;
  devices: DeviceAPI;
  llm: LLMClient;
  storage: ModuleStorage;
}

export interface LifeState {
  timestamp: string;
  summary: string;
  signals: Record<string, unknown>;
}

export interface PlannedAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
}

export interface ModulePlan {
  moduleId: string;
  rationale: string;
  actions: PlannedAction[];
}

export type SystemEvent =
  | { kind: 'goal.updated'; event: BaseEvent<Record<string, unknown>> }
  | { kind: 'task.updated'; event: BaseEvent<Record<string, unknown>> }
  | { kind: 'health.changed'; event: BaseEvent<Record<string, unknown>> }
  | { kind: 'agent.work.requested'; event: BaseEvent<Record<string, unknown>> }
  | { kind: 'module.state.changed'; event: BaseEvent<Record<string, unknown>> };

export interface LifeOSModule {
  metadata: ModuleMetadata;
  init(context: ModuleContext): Promise<void>;
  observe(event: SystemEvent): Promise<void>;
  plan(state: LifeState): Promise<ModulePlan | null>;
  act(action: PlannedAction): Promise<void>;
  shutdown?(): Promise<void>;
}
