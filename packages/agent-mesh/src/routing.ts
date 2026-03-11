import type { AgentWorkRequest } from '@lifeos/goal-engine';

import type { AgentCapability, AgentRegistry, AgentRegistryEntry } from './types';

type AgentRegistryResolver = () => AgentRegistry | null;

let registryResolver: AgentRegistryResolver = () => null;

export function setAgentRegistryResolver(resolver: AgentRegistryResolver): void {
  registryResolver = resolver;
}

export async function routeToAgent(
  capability: AgentCapability,
  request: AgentWorkRequest,
): Promise<AgentRegistryEntry | null> {
  void request;

  const registry = registryResolver();

  if (!registry) {
    return null;
  }

  const candidates = await registry.lookup(capability);
  return candidates[0] ?? null;
}
