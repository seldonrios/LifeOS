import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  Topics,
  createEventBusClient,
  type BaseEvent,
  type ManagedEventBus,
} from '@lifeos/event-bus';
import { JwtService, createSecurityClient } from '@lifeos/security';

import type { NodeConfig, NodeRole } from './node';

const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const CAPABILITY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const DEFAULT_RPC_HOST = '127.0.0.1';
const DEFAULT_RPC_PORT = 5590;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;
const DEFAULT_NODE_TTL_MS = 15_000;
const DEFAULT_DELEGATION_TIMEOUT_MS = 8000;
const DEFAULT_LEADER_LEASE_MS = 10_000;
const MAX_RPC_BODY_BYTES = 1_048_576;
const MESH_SCOPE_GOAL_PLAN = 'mesh.goal.plan';
const MESH_SCOPE_INTENT_PUBLISH = 'mesh.intent.publish';
const ALLOWED_RPC_INTENT_TOPICS = new Set<string>([
  Topics.lifeos.voiceIntentResearch,
  Topics.lifeos.voiceIntentWeather,
  Topics.lifeos.voiceIntentNews,
  Topics.lifeos.voiceIntentEmailSummarize,
]);

export interface MeshHeartbeatEntry {
  nodeId: string;
  role: NodeRole;
  capabilities: string[];
  rpcUrl: string;
  lastSeenAt: string;
}

export interface MeshHeartbeatState {
  nodes: MeshHeartbeatEntry[];
  updatedAt: string;
  ttlMs: number;
}

export interface MeshHeartbeatStateOptions {
  env?: NodeJS.ProcessEnv;
  statePath?: string;
  ttlMs?: number;
}

export interface MeshLeaderSnapshot {
  leaderId: string | null;
  leaseUntil: string | null;
  electedAt: string | null;
  term: number;
  updatedAt: string;
}

export interface MeshLeaderSnapshotOptions {
  env?: NodeJS.ProcessEnv;
  statePath?: string;
}

export interface MeshRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  node: NodeConfig;
  rpcHost?: string;
  rpcPort?: number;
  heartbeatIntervalMs?: number;
  heartbeatTtlMs?: number;
  goalPlanner?: (request: MeshGoalPlanRequest) => Promise<unknown>;
  logger?: (line: string) => void;
}

export interface MeshGoalPlanRequest {
  goal: string;
  model?: string;
  requestedAt?: string;
}

export interface MeshIntentPublishRequest {
  topic: string;
  data: Record<string, unknown>;
  source?: string;
}

export interface MeshDelegationResult<TPayload> {
  delegated: boolean;
  capability: string;
  nodeId?: string;
  rpcUrl?: string;
  payload?: TPayload;
  reason?: string;
}

export interface MeshNodeLiveStatus extends NodeConfig {
  rpcUrl: string;
  lastSeenAt: string | null;
  ageMs: number | null;
  healthy: boolean;
}

export interface MeshStatusSnapshot {
  nodes: MeshNodeLiveStatus[];
  assignments: Record<string, string>;
  ttlMs: number;
  updatedAt: string;
  leaderId: string | null;
  term: number;
  leaseUntil: string | null;
  isLeader: boolean;
  leaderHealthy: boolean;
}

interface MeshStateDocument {
  nodes: NodeConfig[];
  assignments: Record<string, string>;
  updatedAt: string;
}

interface HeartbeatPayload {
  nodeId: string;
  role: NodeRole;
  capabilities: string[];
  rpcUrl: string;
  emittedAt: string;
}

interface MeshRpcGoalPlanResponse extends Record<string, unknown> {
  plan: unknown;
}

interface MeshRpcIntentPublishResponse extends Record<string, unknown> {
  accepted: boolean;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

function normalizeNodeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return NODE_ID_PATTERN.test(normalized) ? normalized : null;
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

function normalizeNodeRole(value: unknown): NodeRole | null {
  if (value === 'primary' || value === 'fallback' || value === 'heavy-compute') {
    return value;
  }
  return null;
}

function normalizeRpcUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function assertJwtSecretForProduction(env: NodeJS.ProcessEnv): void {
  const mode = (env.NODE_ENV ?? '').trim().toLowerCase();
  if (mode !== 'production') {
    return;
  }
  const secret = env.LIFEOS_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('LIFEOS_JWT_SECRET is required in production mesh mode.');
  }
}

function resolveRpcUrl(node: NodeConfig, host: string, port: number): string {
  const explicit = normalizeRpcUrl(node.rpcUrl);
  if (explicit) {
    return explicit;
  }
  const normalizedHost = host.trim() || DEFAULT_RPC_HOST;
  return `http://${normalizedHost}:${port}`;
}

function toRuntimeEvent<T>(type: string, data: T): BaseEvent<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source: 'mesh-runtime',
    version: '0.1.0',
    data,
  };
}

function defaultHeartbeatState(ttlMs: number, now = new Date()): MeshHeartbeatState {
  return {
    nodes: [],
    updatedAt: now.toISOString(),
    ttlMs,
  };
}

function getMeshStatePath(env: NodeJS.ProcessEnv): string {
  return join(resolveHomeDir(env), '.lifeos', 'mesh.json');
}

function getMeshLeaderStatePath(options: MeshLeaderSnapshotOptions = {}): string {
  if (options.statePath) {
    return options.statePath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'mesh-leader.json');
}

function defaultMeshLeaderSnapshot(now = new Date()): MeshLeaderSnapshot {
  return {
    leaderId: null,
    leaseUntil: null,
    electedAt: null,
    term: 0,
    updatedAt: now.toISOString(),
  };
}

function normalizeMeshNode(value: unknown): NodeConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const nodeId = normalizeNodeId(record.nodeId);
  const role = normalizeNodeRole(record.role);
  const capabilities = normalizeCapabilities(record.capabilities);
  const rpcUrl = normalizeRpcUrl(record.rpcUrl);
  if (!nodeId || !role) {
    return null;
  }
  return {
    nodeId,
    role,
    capabilities,
    ...(rpcUrl ? { rpcUrl } : {}),
  };
}

async function readMeshStateDocument(env: NodeJS.ProcessEnv): Promise<MeshStateDocument> {
  try {
    const raw = JSON.parse(await readFile(getMeshStatePath(env), 'utf8')) as Record<
      string,
      unknown
    >;
    const nodes = Array.isArray(raw.nodes)
      ? raw.nodes
          .map((entry) => normalizeMeshNode(entry))
          .filter((entry): entry is NodeConfig => entry !== null)
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
      nodes,
      assignments,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return {
      nodes: [],
      assignments: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function rolePriority(role: NodeRole): number {
  if (role === 'heavy-compute') {
    return 0;
  }
  if (role === 'primary') {
    return 1;
  }
  return 2;
}

function leaderRolePriority(role: NodeRole): number {
  if (role === 'primary') {
    return 0;
  }
  if (role === 'heavy-compute') {
    return 1;
  }
  return 2;
}

function parseHeartbeatTimestamp(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Date.now() - parsed);
}

function buildStalenessFlags(
  nodeId: string,
  heartbeats: Map<string, MeshHeartbeatEntry>,
  ttlMs: number,
): { lastSeenAt: string | null; ageMs: number | null; healthy: boolean } {
  const heartbeat = heartbeats.get(nodeId);
  if (!heartbeat) {
    return {
      lastSeenAt: null,
      ageMs: null,
      healthy: false,
    };
  }
  const ageMs = parseHeartbeatTimestamp(heartbeat.lastSeenAt);
  return {
    lastSeenAt: heartbeat.lastSeenAt,
    ageMs: Number.isFinite(ageMs) ? ageMs : null,
    healthy: Number.isFinite(ageMs) && ageMs <= ttlMs,
  };
}

function parseIsoTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isLeaseActive(leaseUntil: string | null, nowMs: number): boolean {
  const leaseUntilMs = parseIsoTimestamp(leaseUntil);
  return Number.isFinite(leaseUntilMs) && leaseUntilMs > nowMs;
}

function selectLeaderCandidate(candidates: MeshNodeLiveStatus[]): MeshNodeLiveStatus | null {
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((left, right) => {
    const leaderRank = leaderRolePriority(left.role) - leaderRolePriority(right.role);
    if (leaderRank !== 0) {
      return leaderRank;
    }
    const leftAge = left.ageMs ?? Number.POSITIVE_INFINITY;
    const rightAge = right.ageMs ?? Number.POSITIVE_INFINITY;
    if (leftAge !== rightAge) {
      return leftAge - rightAge;
    }
    return left.nodeId.localeCompare(right.nodeId);
  });
  return sorted[0] ?? null;
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_RPC_BODY_BYTES) {
      throw new Error(`request body exceeds ${MAX_RPC_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(`${JSON.stringify(payload)}\n`);
}

function normalizeGoalPlanRequest(raw: unknown): MeshGoalPlanRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const goal = typeof record.goal === 'string' ? record.goal.trim() : '';
  if (!goal) {
    return null;
  }
  return {
    goal,
    ...(typeof record.model === 'string' && record.model.trim()
      ? { model: record.model.trim() }
      : {}),
    ...(typeof record.requestedAt === 'string' ? { requestedAt: record.requestedAt } : {}),
  };
}

function normalizeIntentPublishRequest(raw: unknown): MeshIntentPublishRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const topic = typeof record.topic === 'string' ? record.topic.trim() : '';
  if (
    !topic ||
    !ALLOWED_RPC_INTENT_TOPICS.has(topic) ||
    !record.data ||
    typeof record.data !== 'object' ||
    Array.isArray(record.data)
  ) {
    return null;
  }
  return {
    topic,
    data: record.data as Record<string, unknown>,
    ...(typeof record.source === 'string' && record.source.trim()
      ? { source: record.source.trim() }
      : {}),
  };
}

export function getMeshHeartbeatStatePath(options: MeshHeartbeatStateOptions = {}): string {
  if (options.statePath) {
    return options.statePath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'mesh-heartbeats.json');
}

export async function readMeshHeartbeatState(
  options: MeshHeartbeatStateOptions = {},
): Promise<MeshHeartbeatState> {
  const ttlMs =
    options.ttlMs ??
    parsePositiveInt((options.env ?? process.env).LIFEOS_MESH_NODE_TTL_MS, DEFAULT_NODE_TTL_MS);
  const statePath = getMeshHeartbeatStatePath(options);
  try {
    const raw = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
    const parsedNodes = Array.isArray(raw.nodes)
      ? raw.nodes
          .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              return null;
            }
            const candidate = entry as Record<string, unknown>;
            const nodeId = normalizeNodeId(candidate.nodeId);
            const role = normalizeNodeRole(candidate.role);
            const rpcUrl = normalizeRpcUrl(candidate.rpcUrl);
            if (!nodeId || !role || !rpcUrl) {
              return null;
            }
            return {
              nodeId,
              role,
              capabilities: normalizeCapabilities(candidate.capabilities),
              rpcUrl,
              lastSeenAt:
                typeof candidate.lastSeenAt === 'string'
                  ? candidate.lastSeenAt
                  : new Date().toISOString(),
            } satisfies MeshHeartbeatEntry;
          })
          .filter((entry): entry is MeshHeartbeatEntry => entry !== null)
      : [];
    const deduped = new Map<string, MeshHeartbeatEntry>();
    for (const node of parsedNodes) {
      deduped.set(node.nodeId, node);
    }
    return {
      nodes: Array.from(deduped.values()),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      ttlMs,
    };
  } catch {
    return defaultHeartbeatState(ttlMs);
  }
}

export async function writeMeshHeartbeatState(
  state: MeshHeartbeatState,
  options: MeshHeartbeatStateOptions = {},
): Promise<MeshHeartbeatState> {
  const statePath = getMeshHeartbeatStatePath(options);
  const normalized: MeshHeartbeatState = {
    nodes: state.nodes
      .filter((entry) => {
        return Boolean(
          normalizeNodeId(entry.nodeId) &&
          normalizeNodeRole(entry.role) &&
          normalizeRpcUrl(entry.rpcUrl),
        );
      })
      .map((entry) => ({
        nodeId: entry.nodeId.trim().toLowerCase(),
        role: entry.role,
        capabilities: normalizeCapabilities(entry.capabilities),
        rpcUrl: normalizeRpcUrl(entry.rpcUrl) as string,
        lastSeenAt: entry.lastSeenAt,
      })),
    updatedAt: new Date().toISOString(),
    ttlMs: state.ttlMs,
  };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function readMeshLeaderSnapshot(
  options: MeshLeaderSnapshotOptions = {},
): Promise<MeshLeaderSnapshot> {
  const statePath = getMeshLeaderStatePath(options);
  try {
    const raw = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
    const leaderId = normalizeNodeId(raw.leaderId);
    const leaseUntil =
      typeof raw.leaseUntil === 'string' && raw.leaseUntil.trim().length > 0
        ? raw.leaseUntil
        : null;
    const electedAt =
      typeof raw.electedAt === 'string' && raw.electedAt.trim().length > 0 ? raw.electedAt : null;
    const term =
      typeof raw.term === 'number' && Number.isFinite(raw.term) && raw.term >= 0
        ? Math.trunc(raw.term)
        : 0;
    return {
      leaderId,
      leaseUntil,
      electedAt,
      term,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultMeshLeaderSnapshot();
  }
}

export async function writeMeshLeaderSnapshot(
  snapshot: MeshLeaderSnapshot,
  options: MeshLeaderSnapshotOptions = {},
): Promise<MeshLeaderSnapshot> {
  const statePath = getMeshLeaderStatePath(options);
  const normalized: MeshLeaderSnapshot = {
    leaderId: normalizeNodeId(snapshot.leaderId),
    leaseUntil:
      typeof snapshot.leaseUntil === 'string' && snapshot.leaseUntil.trim().length > 0
        ? snapshot.leaseUntil
        : null,
    electedAt:
      typeof snapshot.electedAt === 'string' && snapshot.electedAt.trim().length > 0
        ? snapshot.electedAt
        : null,
    term:
      typeof snapshot.term === 'number' && Number.isFinite(snapshot.term) && snapshot.term >= 0
        ? Math.trunc(snapshot.term)
        : 0,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export class MeshRpcClient {
  private readonly jwt = new JwtService();
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = DEFAULT_DELEGATION_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  private async issueToken(scopes: string[]): Promise<string> {
    const token = await this.jwt.issue({
      sub: 'service:mesh-coordinator',
      service_id: 'mesh-coordinator',
      scopes,
    });
    return token.token;
  }

  private async post<TPayload, TResult extends Record<string, unknown>>(
    endpoint: string,
    payload: TPayload,
    scopes: string[],
    timeoutMs?: number,
  ): Promise<TResult> {
    const token = await this.issueToken(scopes);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const reason = await response.text();
        throw new Error(`${response.status} ${reason.trim()}`);
      }
      return (await response.json()) as TResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  async goalPlan(
    rpcUrl: string,
    request: MeshGoalPlanRequest,
    timeoutMs?: number,
  ): Promise<MeshRpcGoalPlanResponse> {
    return this.post<MeshGoalPlanRequest, MeshRpcGoalPlanResponse>(
      `${rpcUrl}/rpc/goal-plan`,
      request,
      [MESH_SCOPE_GOAL_PLAN],
      timeoutMs,
    );
  }

  async intentPublish(
    rpcUrl: string,
    request: MeshIntentPublishRequest,
    timeoutMs?: number,
  ): Promise<MeshRpcIntentPublishResponse> {
    return this.post<MeshIntentPublishRequest, MeshRpcIntentPublishResponse>(
      `${rpcUrl}/rpc/intent-publish`,
      request,
      [MESH_SCOPE_INTENT_PUBLISH],
      timeoutMs,
    );
  }
}

export class MeshRpcServer {
  private readonly security = createSecurityClient();
  private readonly logger: (line: string) => void;
  private server: HttpServer | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly goalPlanner: ((request: MeshGoalPlanRequest) => Promise<unknown>) | undefined;
  private readonly intentPublisher: (request: MeshIntentPublishRequest) => Promise<void>;

  constructor(options: {
    host: string;
    port: number;
    goalPlanner?: (request: MeshGoalPlanRequest) => Promise<unknown>;
    intentPublisher: (request: MeshIntentPublishRequest) => Promise<void>;
    logger?: (line: string) => void;
  }) {
    this.host = options.host;
    this.port = options.port;
    this.goalPlanner = options.goalPlanner;
    this.intentPublisher = options.intentPublisher;
    this.logger = options.logger ?? (() => undefined);
  }

  private async verifyScope(req: IncomingMessage, scope: string): Promise<boolean> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return false;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return false;
    }
    const context = await this.security.getAuthContext(token);
    if (!context) {
      return false;
    }
    return context.scopes.includes(scope);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }
    if (req.url === '/rpc/goal-plan') {
      const authorized = await this.verifyScope(req, MESH_SCOPE_GOAL_PLAN);
      if (!authorized) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (!this.goalPlanner) {
        sendJson(res, 503, { error: 'goal_planner_unavailable' });
        return;
      }
      try {
        const parsed = normalizeGoalPlanRequest(JSON.parse(await readRequestBody(req)) as unknown);
        if (!parsed) {
          sendJson(res, 400, { error: 'invalid_goal_plan_request' });
          return;
        }
        const plan = await this.goalPlanner(parsed);
        sendJson(res, 200, { plan });
      } catch (error: unknown) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (req.url === '/rpc/intent-publish') {
      const authorized = await this.verifyScope(req, MESH_SCOPE_INTENT_PUBLISH);
      if (!authorized) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      try {
        const parsed = normalizeIntentPublishRequest(
          JSON.parse(await readRequestBody(req)) as unknown,
        );
        if (!parsed) {
          sendJson(res, 400, { error: 'invalid_intent_publish_request' });
          return;
        }
        await this.intentPublisher(parsed);
        sendJson(res, 200, { accepted: true });
      } catch (error: unknown) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.port, this.host, () => {
        resolve();
      });
    });
    this.logger(`mesh_rpc_server_started host=${this.host} port=${this.port}`);
  }

  async close(): Promise<void> {
    if (!this.server) {
      return;
    }
    const current = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  }
}

export class MeshRuntime {
  private readonly env: NodeJS.ProcessEnv;
  private readonly node: NodeConfig;
  private readonly host: string;
  private readonly port: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTtlMs: number;
  private readonly logger: (line: string) => void;
  private readonly goalPlanner: ((request: MeshGoalPlanRequest) => Promise<unknown>) | undefined;
  private readonly rpcUrl: string;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private eventBus: ManagedEventBus | null = null;
  private rpcServer: MeshRpcServer | null = null;
  private closed = false;

  constructor(options: MeshRuntimeOptions) {
    this.env = options.env ?? process.env;
    assertJwtSecretForProduction(this.env);
    this.node = options.node;
    this.host = options.rpcHost ?? this.env.LIFEOS_MESH_RPC_HOST?.trim() ?? DEFAULT_RPC_HOST;
    this.port = options.rpcPort ?? parsePort(this.env.LIFEOS_MESH_RPC_PORT, DEFAULT_RPC_PORT);
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ??
      parsePositiveInt(this.env.LIFEOS_MESH_HEARTBEAT_INTERVAL_MS, DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.heartbeatTtlMs =
      options.heartbeatTtlMs ??
      parsePositiveInt(this.env.LIFEOS_MESH_NODE_TTL_MS, DEFAULT_NODE_TTL_MS);
    this.goalPlanner = options.goalPlanner;
    this.logger = options.logger ?? (() => undefined);
    this.rpcUrl = resolveRpcUrl(this.node, this.host, this.port);
  }

  private getHeartbeatStateOptions(): MeshHeartbeatStateOptions {
    return {
      env: this.env,
      ttlMs: this.heartbeatTtlMs,
    };
  }

  private async upsertHeartbeat(payload: HeartbeatPayload): Promise<void> {
    const state = await readMeshHeartbeatState(this.getHeartbeatStateOptions());
    const next = new Map(state.nodes.map((node) => [node.nodeId, node]));
    next.set(payload.nodeId, {
      nodeId: payload.nodeId,
      role: payload.role,
      capabilities: payload.capabilities,
      rpcUrl: payload.rpcUrl,
      lastSeenAt: payload.emittedAt,
    });
    await writeMeshHeartbeatState(
      {
        ...state,
        nodes: Array.from(next.values()),
      },
      this.getHeartbeatStateOptions(),
    );
  }

  private async removeHeartbeat(nodeId: string): Promise<void> {
    const state = await readMeshHeartbeatState(this.getHeartbeatStateOptions());
    const filtered = state.nodes.filter((node) => node.nodeId !== nodeId);
    await writeMeshHeartbeatState(
      {
        ...state,
        nodes: filtered,
      },
      this.getHeartbeatStateOptions(),
    );
  }

  private async publishHeartbeat(): Promise<void> {
    if (!this.eventBus) {
      return;
    }
    const payload: HeartbeatPayload = {
      nodeId: this.node.nodeId,
      role: this.node.role,
      capabilities: this.node.capabilities,
      rpcUrl: this.rpcUrl,
      emittedAt: new Date().toISOString(),
    };
    await this.eventBus.publish(
      Topics.lifeos.meshNodeHeartbeat,
      toRuntimeEvent(Topics.lifeos.meshNodeHeartbeat, payload),
    );
    await this.upsertHeartbeat(payload);
  }

  async start(): Promise<void> {
    if (this.closed) {
      throw new Error('mesh runtime is closed');
    }
    if (this.eventBus) {
      return;
    }
    const createBus = createEventBusClient({
      env: this.env,
      name: 'lifeos-mesh-runtime',
      timeoutMs: 1000,
      maxReconnectAttempts: -1,
      logger: (line) => this.logger(line),
    });
    this.eventBus = createBus;

    await this.eventBus.subscribe<HeartbeatPayload>(
      Topics.lifeos.meshNodeHeartbeat,
      async (event) => {
        const payload = event.data;
        if (!payload || typeof payload !== 'object') {
          return;
        }
        await this.upsertHeartbeat(payload);
      },
    );
    await this.eventBus.subscribe<{ nodeId: string }>(Topics.lifeos.meshNodeLeft, async (event) => {
      const nodeId = normalizeNodeId(event.data.nodeId);
      if (!nodeId) {
        return;
      }
      await this.removeHeartbeat(nodeId);
    });

    const rpcServerOptions: {
      host: string;
      port: number;
      goalPlanner?: (request: MeshGoalPlanRequest) => Promise<unknown>;
      intentPublisher: (request: MeshIntentPublishRequest) => Promise<void>;
      logger: (line: string) => void;
    } = {
      host: this.host,
      port: this.port,
      intentPublisher: async (request) => {
        if (!this.eventBus) {
          throw new Error('mesh event bus unavailable');
        }
        await this.eventBus.publish(request.topic, toRuntimeEvent(request.topic, request.data));
      },
      logger: this.logger,
    };
    if (this.goalPlanner) {
      rpcServerOptions.goalPlanner = this.goalPlanner;
    }
    this.rpcServer = new MeshRpcServer(rpcServerOptions);
    await this.rpcServer.start();
    await this.publishHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      void this.publishHeartbeat().catch((error: unknown) => {
        this.logger(
          `mesh_heartbeat_publish_degraded reason=${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, this.heartbeatIntervalMs);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.eventBus) {
      await this.eventBus
        .publish(
          Topics.lifeos.meshNodeLeft,
          toRuntimeEvent(Topics.lifeos.meshNodeLeft, { nodeId: this.node.nodeId }),
        )
        .catch(() => undefined);
    }
    await this.removeHeartbeat(this.node.nodeId).catch(() => undefined);

    if (this.rpcServer) {
      await this.rpcServer.close();
      this.rpcServer = null;
    }
    if (this.eventBus) {
      await this.eventBus.close();
      this.eventBus = null;
    }
  }
}

export class MeshCoordinator {
  private readonly env: NodeJS.ProcessEnv;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly leaderLeaseMs: number;
  private readonly localNodeId: string | null;
  private readonly rpcClient: MeshRpcClient;
  private readonly eventBusOverride: ManagedEventBus | null;
  private readonly logger: (line: string) => void;

  constructor(
    options: {
      env?: NodeJS.ProcessEnv;
      ttlMs?: number;
      timeoutMs?: number;
      leaderLeaseMs?: number;
      nodeId?: string;
      eventBus?: ManagedEventBus;
      logger?: (line: string) => void;
    } = {},
  ) {
    this.env = options.env ?? process.env;
    assertJwtSecretForProduction(this.env);
    this.ttlMs =
      options.ttlMs ?? parsePositiveInt(this.env.LIFEOS_MESH_NODE_TTL_MS, DEFAULT_NODE_TTL_MS);
    this.timeoutMs =
      options.timeoutMs ??
      parsePositiveInt(this.env.LIFEOS_MESH_DELEGATION_TIMEOUT_MS, DEFAULT_DELEGATION_TIMEOUT_MS);
    this.leaderLeaseMs =
      options.leaderLeaseMs ??
      parsePositiveInt(this.env.LIFEOS_MESH_LEADER_LEASE_MS, DEFAULT_LEADER_LEASE_MS);
    this.localNodeId = normalizeNodeId(options.nodeId ?? this.env.LIFEOS_MESH_NODE_ID ?? null);
    this.rpcClient = new MeshRpcClient(this.timeoutMs);
    this.logger = options.logger ?? (() => undefined);
    this.eventBusOverride = options.eventBus ?? null;
  }

  private async publishLeaderEvent(topic: string, data: Record<string, unknown>): Promise<void> {
    const eventBus =
      this.eventBusOverride ??
      createEventBusClient({
        env: this.env,
        name: 'lifeos-mesh-coordinator',
        timeoutMs: 1000,
        maxReconnectAttempts: 0,
        logger: (line) => this.logger(line),
      });
    try {
      await eventBus.publish(topic, toRuntimeEvent(topic, data));
    } catch (error: unknown) {
      this.logger(
        `mesh_leader_event_degraded topic=${topic} reason=${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (!this.eventBusOverride) {
        await eventBus.close().catch(() => undefined);
      }
    }
  }

  private async resolveLeaderSnapshot(nodes: MeshNodeLiveStatus[]): Promise<{
    snapshot: MeshLeaderSnapshot;
    leaderHealthy: boolean;
  }> {
    const now = new Date();
    const nowMs = now.getTime();
    const persisted = await readMeshLeaderSnapshot({ env: this.env });
    const healthyNodes = nodes.filter((node) => node.healthy);
    const previousLeader =
      persisted.leaderId !== null
        ? (healthyNodes.find((node) => node.nodeId === persisted.leaderId) ?? null)
        : null;

    let nextLeaderId = persisted.leaderId;
    let nextElectedAt = persisted.electedAt;
    let nextLeaseUntil = persisted.leaseUntil;
    let nextTerm = persisted.term;

    if (!previousLeader || !isLeaseActive(persisted.leaseUntil, nowMs)) {
      const elected = selectLeaderCandidate(healthyNodes);
      nextLeaderId = elected?.nodeId ?? null;
      nextLeaseUntil =
        nextLeaderId === null ? null : new Date(nowMs + this.leaderLeaseMs).toISOString();
      nextElectedAt = nextLeaderId === null ? null : now.toISOString();
      if (nextLeaderId !== persisted.leaderId) {
        nextTerm = persisted.term + 1;
      } else if (nextLeaderId !== null && !isLeaseActive(persisted.leaseUntil, nowMs)) {
        nextTerm = persisted.term + 1;
      }
    }

    const leaderHealthy =
      nextLeaderId !== null && healthyNodes.some((node) => node.nodeId === nextLeaderId);

    const changed =
      persisted.leaderId !== nextLeaderId ||
      persisted.term !== nextTerm ||
      persisted.leaseUntil !== nextLeaseUntil ||
      persisted.electedAt !== nextElectedAt;

    const snapshot: MeshLeaderSnapshot = {
      leaderId: nextLeaderId,
      leaseUntil: nextLeaseUntil,
      electedAt: nextElectedAt,
      term: nextTerm,
      updatedAt: now.toISOString(),
    };

    if (changed) {
      await writeMeshLeaderSnapshot(snapshot, { env: this.env });
      if (persisted.leaderId && nextLeaderId === null) {
        await this.publishLeaderEvent(Topics.lifeos.meshLeaderLost, {
          previousLeaderId: persisted.leaderId,
          term: nextTerm,
          at: snapshot.updatedAt,
        });
      } else if (!persisted.leaderId && nextLeaderId) {
        await this.publishLeaderEvent(Topics.lifeos.meshLeaderElected, {
          leaderId: nextLeaderId,
          term: nextTerm,
          leaseUntil: nextLeaseUntil,
          electedAt: nextElectedAt,
        });
      } else if (persisted.leaderId && nextLeaderId && persisted.leaderId !== nextLeaderId) {
        await this.publishLeaderEvent(Topics.lifeos.meshLeaderChanged, {
          previousLeaderId: persisted.leaderId,
          leaderId: nextLeaderId,
          term: nextTerm,
          leaseUntil: nextLeaseUntil,
          electedAt: nextElectedAt,
        });
      } else if (nextLeaderId && persisted.term !== nextTerm) {
        await this.publishLeaderEvent(Topics.lifeos.meshLeaderElected, {
          leaderId: nextLeaderId,
          term: nextTerm,
          leaseUntil: nextLeaseUntil,
          electedAt: nextElectedAt,
        });
      }
    }

    return {
      snapshot,
      leaderHealthy,
    };
  }

  private async buildStatusSnapshot(): Promise<MeshStatusSnapshot> {
    const state = await readMeshStateDocument(this.env);
    const heartbeat = await readMeshHeartbeatState({ env: this.env, ttlMs: this.ttlMs });
    const heartbeatByNode = new Map(heartbeat.nodes.map((entry) => [entry.nodeId, entry]));
    const nodes = state.nodes
      .filter((node): node is NodeConfig & { rpcUrl: string } => typeof node.rpcUrl === 'string')
      .map((node) => {
        const live = buildStalenessFlags(node.nodeId, heartbeatByNode, this.ttlMs);
        return {
          ...node,
          rpcUrl: node.rpcUrl as string,
          ...live,
        };
      })
      .sort((left, right) => {
        if (left.healthy !== right.healthy) {
          return left.healthy ? -1 : 1;
        }
        const roleRank = rolePriority(left.role) - rolePriority(right.role);
        if (roleRank !== 0) {
          return roleRank;
        }
        return left.nodeId.localeCompare(right.nodeId);
      });

    const leader = await this.resolveLeaderSnapshot(nodes);
    const leaderId = leader.snapshot.leaderId;

    return {
      nodes,
      assignments: state.assignments,
      ttlMs: this.ttlMs,
      updatedAt: new Date().toISOString(),
      leaderId,
      term: leader.snapshot.term,
      leaseUntil: leader.snapshot.leaseUntil,
      isLeader: leaderId !== null && this.localNodeId === leaderId,
      leaderHealthy: leader.leaderHealthy,
    };
  }

  async getLiveStatus(): Promise<MeshStatusSnapshot> {
    return this.buildStatusSnapshot();
  }

  private selectNode(snapshot: MeshStatusSnapshot, capability: string): MeshNodeLiveStatus | null {
    const normalizedCapability = capability.trim().toLowerCase();
    const assignedNodeId = snapshot.assignments[normalizedCapability];
    const candidates = snapshot.nodes.filter((node) =>
      node.capabilities.includes(normalizedCapability),
    );
    const healthyCandidates = candidates.filter((node) => node.healthy);
    if (healthyCandidates.length === 0) {
      return null;
    }

    healthyCandidates.sort((left, right) => {
      const leftAssigned = assignedNodeId === left.nodeId ? 0 : 1;
      const rightAssigned = assignedNodeId === right.nodeId ? 0 : 1;
      if (leftAssigned !== rightAssigned) {
        return leftAssigned - rightAssigned;
      }
      const leftAge = left.ageMs ?? Number.POSITIVE_INFINITY;
      const rightAge = right.ageMs ?? Number.POSITIVE_INFINITY;
      if (leftAge !== rightAge) {
        return leftAge - rightAge;
      }
      const roleRank = rolePriority(left.role) - rolePriority(right.role);
      if (roleRank !== 0) {
        return roleRank;
      }
      return left.nodeId.localeCompare(right.nodeId);
    });

    return healthyCandidates[0] ?? null;
  }

  async delegateGoalPlan(request: MeshGoalPlanRequest): Promise<MeshDelegationResult<unknown>> {
    const snapshot = await this.buildStatusSnapshot();
    const node = this.selectNode(snapshot, 'goal-planning');
    if (!node) {
      return {
        delegated: false,
        capability: 'goal-planning',
        reason: 'no_node',
      };
    }

    try {
      const response = await this.rpcClient.goalPlan(node.rpcUrl, request, this.timeoutMs);
      return {
        delegated: true,
        capability: 'goal-planning',
        nodeId: node.nodeId,
        rpcUrl: node.rpcUrl,
        payload: response.plan,
      };
    } catch (error: unknown) {
      return {
        delegated: false,
        capability: 'goal-planning',
        nodeId: node.nodeId,
        rpcUrl: node.rpcUrl,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async delegateIntentPublish(request: {
    capability: string;
    topic: string;
    data: Record<string, unknown>;
    source?: string;
  }): Promise<MeshDelegationResult<MeshRpcIntentPublishResponse>> {
    const capability = request.capability.trim().toLowerCase();
    const snapshot = await this.buildStatusSnapshot();
    const node = this.selectNode(snapshot, capability);
    if (!node) {
      return {
        delegated: false,
        capability,
        reason: 'no_node',
      };
    }

    try {
      const response = await this.rpcClient.intentPublish(
        node.rpcUrl,
        {
          topic: request.topic,
          data: request.data,
          ...(request.source ? { source: request.source } : {}),
        },
        this.timeoutMs,
      );
      return {
        delegated: true,
        capability,
        nodeId: node.nodeId,
        rpcUrl: node.rpcUrl,
        payload: response,
      };
    } catch (error: unknown) {
      return {
        delegated: false,
        capability,
        nodeId: node.nodeId,
        rpcUrl: node.rpcUrl,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async close(): Promise<void> {
    if (!this.eventBusOverride) {
      return;
    }
    await this.eventBusOverride.close().catch(() => undefined);
  }
}

export async function waitForMeshHeartbeat(
  nodeId: string,
  options: MeshHeartbeatStateOptions & { timeoutMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DELEGATION_TIMEOUT_MS;
  const startedAt = Date.now();
  const normalizedNodeId = normalizeNodeId(nodeId);
  if (!normalizedNodeId) {
    return false;
  }
  while (Date.now() - startedAt <= timeoutMs) {
    const state = await readMeshHeartbeatState(options);
    if (state.nodes.some((entry) => entry.nodeId === normalizedNodeId)) {
      return true;
    }
    await delay(100);
  }
  return false;
}
