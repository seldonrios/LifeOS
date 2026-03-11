import type { AgentWorkRequest } from '@lifeos/goal-engine';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type {
  LifeOSModule,
  ModuleStorage,
  ModuleContext,
  SystemEvent,
  LifeState,
  ModulePlan,
  PlannedAction,
} from '@lifeos/reasoning';

export enum AgentStatus {
  active = 'active',
  idle = 'idle',
  suspended = 'suspended',
}

export type AgentCapability =
  | 'workout-planning'
  | 'fatigue-analysis'
  | 'health-monitoring'
  | 'crop-readiness'
  | 'harvest-scheduling'
  | 'soil-analysis'
  | 'inventory-tracking'
  | 'market-analysis'
  | 'pricing-optimization'
  | 'budget-tracking'
  | 'income-forecasting'
  | 'event-scheduling'
  | 'conflict-detection'
  | 'presence-routing'
  | 'device-control'
  | 'music-practice'
  | 'goal-planning'
  | 'communications-routing';

export interface TimelineEventQuery {
  replay(type: string, since: string): Promise<unknown[]>;
}

export interface AgentRegistryEntry {
  id: string;
  name: string;
  moduleId: string;
  capabilities: AgentCapability[];
  permissionScope: string[];
  status: AgentStatus;
  lastActive: string;
}

export enum AgentTier {
  orchestration = 'orchestration',
  specialist = 'specialist',
}

export interface AgentManifest {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  tier: AgentTier;
}

export interface WorkingMemoryContext {
  longTermMemory: LifeGraphClient;
  workingStorage: ModuleStorage;
  timelineEvents: TimelineEventQuery;
}

export interface AgentAuditEntry {
  agentId: string;
  actionType: string;
  timestamp: string;
  correlationId: string;
  resultEventId?: string;
  graphMutationId?: string;
}

export interface AgentRegistry {
  register(entry: AgentRegistryEntry): Promise<void>;
  lookup(capability: AgentCapability): Promise<AgentRegistryEntry[]>;
  list(): Promise<AgentRegistryEntry[]>;
}

export interface AgentMeshClient extends AgentRegistry {
  publishWorkRequest(req: AgentWorkRequest): Promise<void>;
}

export abstract class ConciergeAgent implements LifeOSModule {
  abstract metadata: LifeOSModule['metadata'];
  abstract init(context: ModuleContext): Promise<void>;
  abstract observe(event: SystemEvent): Promise<void>;
  abstract plan(state: LifeState): Promise<ModulePlan | null>;
  abstract act(action: PlannedAction): Promise<void>;
  abstract handleUserIntent(intent: string): Promise<void>;
}

export abstract class PlannerAgent implements LifeOSModule {
  abstract metadata: LifeOSModule['metadata'];
  abstract init(context: ModuleContext): Promise<void>;
  abstract observe(event: SystemEvent): Promise<void>;
  abstract plan(state: LifeState): Promise<ModulePlan | null>;
  abstract act(action: PlannedAction): Promise<void>;
  abstract generatePlan(goalId: string): Promise<void>;
}

export abstract class MonitorAgent implements LifeOSModule {
  abstract metadata: LifeOSModule['metadata'];
  abstract init(context: ModuleContext): Promise<void>;
  abstract observe(event: SystemEvent): Promise<void>;
  abstract plan(state: LifeState): Promise<ModulePlan | null>;
  abstract act(action: PlannedAction): Promise<void>;
  abstract evaluateSignals(): Promise<void>;
}
