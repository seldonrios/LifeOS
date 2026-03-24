import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { NodeConfig } from './node';

export * from './node';

export interface MeshState {
  nodes: NodeConfig[];
  assignments: Record<string, string>;
  updatedAt: string;
}

export interface MeshStateOptions {
  env?: NodeJS.ProcessEnv;
  statePath?: string;
}

const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const CAPABILITY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

export function getMeshStatePath(options: MeshStateOptions = {}): string {
  if (options.statePath) {
    return options.statePath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'mesh.json');
}

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => CAPABILITY_PATTERN.test(entry));
  return [...new Set(normalized)];
}

function normalizeNode(value: unknown): NodeConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const node = value as Record<string, unknown>;
  const nodeId =
    typeof node.nodeId === 'string' && NODE_ID_PATTERN.test(node.nodeId.trim().toLowerCase())
      ? node.nodeId.trim().toLowerCase()
      : null;
  const role =
    node.role === 'primary' || node.role === 'fallback' || node.role === 'heavy-compute'
      ? node.role
      : null;
  if (!nodeId || !role) {
    return null;
  }
  return {
    nodeId,
    role,
    capabilities: normalizeCapabilities(node.capabilities),
  };
}

function defaultState(now = new Date()): MeshState {
  return {
    nodes: [],
    assignments: {},
    updatedAt: now.toISOString(),
  };
}

export async function readMeshState(options: MeshStateOptions = {}): Promise<MeshState> {
  const path = getMeshStatePath(options);
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    const parsedNodes = Array.isArray(raw.nodes)
      ? raw.nodes
          .map((node) => normalizeNode(node))
          .filter((node): node is NodeConfig => node !== null)
      : [];
    const assignments =
      raw.assignments && typeof raw.assignments === 'object' && !Array.isArray(raw.assignments)
        ? Object.fromEntries(
            Object.entries(raw.assignments).flatMap(([capability, nodeId]) => {
              if (typeof nodeId !== 'string') {
                return [];
              }
              const normalizedCapability = capability.trim().toLowerCase();
              const normalizedNodeId = nodeId.trim().toLowerCase();
              if (!normalizedCapability || !normalizedNodeId) {
                return [];
              }
              return [[normalizedCapability, normalizedNodeId]];
            }),
          )
        : {};

    return {
      nodes: parsedNodes,
      assignments,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
}

export async function writeMeshState(
  state: MeshState,
  options: MeshStateOptions = {},
): Promise<MeshState> {
  const path = getMeshStatePath(options);
  const normalizedNodes = state.nodes
    .map((node) => normalizeNode(node))
    .filter((node): node is NodeConfig => node !== null);
  const normalizedState: MeshState = {
    nodes: normalizedNodes,
    assignments: Object.fromEntries(
      Object.entries(state.assignments).flatMap(([capability, nodeId]) => {
        const normalizedCapability = capability.trim().toLowerCase();
        const normalizedNodeId = nodeId.trim().toLowerCase();
        if (!normalizedCapability || !normalizedNodeId) {
          return [];
        }
        return [[normalizedCapability, normalizedNodeId]];
      }),
    ),
    updatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizedState, null, 2)}\n`, 'utf8');
  return normalizedState;
}

export class MeshRegistry {
  private readonly nodes = new Map<string, NodeConfig>();
  private readonly assignments = new Map<string, string>();

  constructor(state?: MeshState) {
    if (!state) {
      return;
    }
    for (const node of state.nodes) {
      this.join(node);
    }
    for (const [capability, nodeId] of Object.entries(state.assignments)) {
      if (this.nodes.has(nodeId)) {
        this.assign(capability, nodeId);
      }
    }
  }

  join(node: NodeConfig): void {
    const normalized = normalizeNode(node);
    if (!normalized) {
      throw new Error('Node configuration is invalid.');
    }
    this.nodes.set(normalized.nodeId, normalized);
  }

  listNodes(): NodeConfig[] {
    return Array.from(this.nodes.values()).sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId),
    );
  }

  assign(capability: string, nodeId: string): void {
    const normalizedCapability = capability.trim().toLowerCase();
    const normalizedNodeId = nodeId.trim().toLowerCase();
    if (!CAPABILITY_PATTERN.test(normalizedCapability)) {
      throw new Error('Capability is required.');
    }
    const target = this.nodes.get(normalizedNodeId);
    if (!target) {
      throw new Error(`Node "${nodeId}" is not part of the mesh.`);
    }
    if (!target.capabilities.includes(normalizedCapability)) {
      throw new Error(
        `Node "${nodeId}" does not declare capability "${normalizedCapability}". Join with matching capabilities first.`,
      );
    }
    this.assignments.set(normalizedCapability, normalizedNodeId);
  }

  resolve(capability: string): NodeConfig | null {
    const normalizedCapability = capability.trim().toLowerCase();
    const explicitNodeId = this.assignments.get(normalizedCapability);
    if (explicitNodeId) {
      return this.nodes.get(explicitNodeId) ?? null;
    }

    const heavyCandidate = this.listNodes().find((node) =>
      node.capabilities.includes(normalizedCapability),
    );
    return heavyCandidate ?? null;
  }

  toState(): MeshState {
    return {
      nodes: this.listNodes(),
      assignments: Object.fromEntries(this.assignments.entries()),
      updatedAt: new Date().toISOString(),
    };
  }
}
