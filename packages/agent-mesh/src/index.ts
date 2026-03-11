export * from './types';
export { routeToAgent } from './routing';

import type { AgentMeshClient } from './types';

export function createAgentMeshClient(): AgentMeshClient {
  throw new Error('createAgentMeshClient is not implemented.');
}
