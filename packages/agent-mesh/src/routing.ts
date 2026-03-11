import type { AgentWorkRequest } from '@lifeos/goal-engine';

import type { AgentCapability, AgentRegistry, AgentRegistryEntry } from './types';

export async function routeToAgent(
  capability: AgentCapability,
  request: AgentWorkRequest,
  registry: AgentRegistry,
): Promise<AgentRegistryEntry | null> {
  void capability;
  void request;
  void registry;
  throw new Error('routeToAgent is not implemented.');
}
