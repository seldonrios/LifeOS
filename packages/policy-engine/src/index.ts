export * from './types';

import type { PolicyClient, PolicyRequest, PolicyResult } from './types';

const POLICY_ID_DEFAULT = 'lifeos.policy.default.v1';
const MODULE_LOAD_ACTION = 'module.load';
const MODULE_LOAD_RESOURCE = 'lifeos.module';
const MAX_PERMISSION_LIST_SIZE = 64;
const ALLOWED_GRAPH_PERMISSIONS = new Set(['read', 'append', 'write']);
const ALLOWED_VOICE_PERMISSIONS = new Set(['speak', 'listen']);
const EVENT_PERMISSION_PATTERN = /^(subscribe|publish):[A-Za-z0-9.*>_-]+(?:\.[A-Za-z0-9.*>_-]+)*$/;
const NETWORK_PERMISSION_PATTERN = /^[a-z0-9][a-z0-9._-]{1,40}$/;
const WILDCARD_TRUSTED_MODULES = new Set(['orchestrator', 'sync-core']);
const SCOPE_ALIAS: Record<string, string> = {
  life_graph_read: 'graph.read',
  life_graph_write: 'graph.write',
  event_publish: 'event.publish',
  event_subscribe: 'event.subscribe',
  llm_access: 'llm.invoke',
  llm_invoke: 'llm.invoke',
};

type PermissionBlock = {
  graph?: unknown;
  voice?: unknown;
  network?: unknown;
  events?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function deny(reason: string, policyId = POLICY_ID_DEFAULT): PolicyResult {
  return {
    allowed: false,
    reason,
    policy_id: policyId,
  };
}

function allow(policyId = POLICY_ID_DEFAULT): PolicyResult {
  return {
    allowed: true,
    policy_id: policyId,
  };
}

function parseEventPermission(
  permission: string,
): { action: 'subscribe' | 'publish'; topic: string } | null {
  const [action, topic] = permission.split(':', 2);
  if (!action || !topic || (action !== 'subscribe' && action !== 'publish')) {
    return null;
  }

  return {
    action,
    topic,
  };
}

function evaluateModuleLoadPolicy(subject: string, rawPermissions: PermissionBlock): PolicyResult {
  const graphPermissions = toStringArray(rawPermissions.graph);
  const voicePermissions = toStringArray(rawPermissions.voice);
  const networkPermissions = toStringArray(rawPermissions.network);
  const eventPermissions = toStringArray(rawPermissions.events);

  if (
    graphPermissions.length > MAX_PERMISSION_LIST_SIZE ||
    voicePermissions.length > MAX_PERMISSION_LIST_SIZE ||
    networkPermissions.length > MAX_PERMISSION_LIST_SIZE ||
    eventPermissions.length > MAX_PERMISSION_LIST_SIZE
  ) {
    return deny('permission list exceeds policy limits', 'lifeos.policy.module.permissions.v1');
  }

  for (const permission of graphPermissions) {
    if (!ALLOWED_GRAPH_PERMISSIONS.has(permission)) {
      return deny(
        `graph permission "${permission}" is not allowed`,
        'lifeos.policy.module.permissions.v1',
      );
    }
  }

  for (const permission of voicePermissions) {
    if (!ALLOWED_VOICE_PERMISSIONS.has(permission)) {
      return deny(
        `voice permission "${permission}" is not allowed`,
        'lifeos.policy.module.permissions.v1',
      );
    }
  }

  for (const permission of networkPermissions) {
    if (!NETWORK_PERMISSION_PATTERN.test(permission)) {
      return deny(
        `network permission "${permission}" is malformed`,
        'lifeos.policy.module.permissions.v1',
      );
    }
  }

  for (const permission of eventPermissions) {
    if (!EVENT_PERMISSION_PATTERN.test(permission)) {
      return deny(
        `event permission "${permission}" must be subscribe:<topic> or publish:<topic>`,
        'lifeos.policy.module.permissions.v1',
      );
    }

    const parsed = parseEventPermission(permission);
    if (!parsed) {
      return deny(
        `event permission "${permission}" is malformed`,
        'lifeos.policy.module.permissions.v1',
      );
    }

    if (parsed.action === 'publish' && (parsed.topic.includes('*') || parsed.topic.includes('>'))) {
      return deny(
        `event permission "${permission}" is too broad; publish permissions cannot contain "*" or ">"`,
        'lifeos.policy.module.permissions.v1',
      );
    }

    if (
      parsed.action === 'subscribe' &&
      (parsed.topic.includes('*') || parsed.topic.includes('>')) &&
      !WILDCARD_TRUSTED_MODULES.has(subject)
    ) {
      return deny(
        `event permission "${permission}" is too broad for module "${subject}"`,
        'lifeos.policy.module.permissions.v1',
      );
    }
  }

  return allow('lifeos.policy.module.permissions.v1');
}

function normalizeScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes
    .map((scope) => (typeof scope === 'string' ? scope.trim().toLowerCase() : ''))
    .filter((scope) => scope.length > 0);
}

function resolveScopeCandidates(scope: string): string[] {
  const normalized = scope.trim().toLowerCase();
  const candidates = new Set<string>([normalized]);
  const alias = SCOPE_ALIAS[normalized];
  if (alias) {
    candidates.add(alias);
  }

  return Array.from(candidates);
}

function checkScope(scope: string, request: PolicyRequest): boolean {
  const contextScopes = normalizeScopes(request.context?.scopes);
  const requestScopes = normalizeScopes((request as unknown as { scopes?: unknown }).scopes);
  const merged = new Set<string>([...contextScopes, ...requestScopes]);
  const candidates = resolveScopeCandidates(scope);
  return candidates.some((candidate) => merged.has(candidate));
}

export function createPolicyClient(): PolicyClient {
  const strictMode = (process.env.LIFEOS_POLICY_STRICT ?? 'true').trim().toLowerCase() !== 'false';

  const evaluatePolicy = async (request: PolicyRequest): Promise<PolicyResult> => {
    try {
      if (!isRecord(request)) {
        return deny('invalid policy request shape');
      }

      const subject = request.subject?.trim();
      const action = request.action?.trim();
      const resource = request.resource?.trim();
      const context = isRecord(request.context) ? request.context : {};

      if (!subject || !action || !resource) {
        return deny('policy request must include subject, action, and resource');
      }

      if (action === MODULE_LOAD_ACTION && resource === MODULE_LOAD_RESOURCE) {
        const permissions = isRecord(context.permissions)
          ? (context.permissions as PermissionBlock)
          : {};
        return evaluateModuleLoadPolicy(subject, permissions);
      }

      if (!strictMode) {
        return allow('lifeos.policy.compat.allow.v1');
      }

      const scopes = normalizeScopes(context.scopes);
      if (scopes.includes('*') || scopes.includes('policy:allow')) {
        return allow();
      }

      return deny(`no matching policy rule for ${action} on ${resource}`);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      return deny(`policy evaluation failed: ${reason}`);
    }
  };

  return {
    async evaluatePolicy(request: PolicyRequest): Promise<PolicyResult> {
      return evaluatePolicy(request);
    },
    checkPermission(scope: string, context: PolicyRequest): boolean {
      try {
        return checkScope(scope, context);
      } catch {
        return false;
      }
    },
    async evaluate(request: PolicyRequest): Promise<PolicyResult> {
      return evaluatePolicy(request);
    },
  };
}
