export type NodeRole = 'primary' | 'fallback' | 'heavy-compute';

export interface NodeConfig {
  nodeId: string;
  role: NodeRole;
  capabilities: string[];
  rpcUrl?: string;
}
