import type { LifeOSManifestPermissions } from './manifest';

const ALLOWED_GRAPH_PERMISSIONS = new Set(['read', 'append', 'write']);
const ALLOWED_VOICE_PERMISSIONS = new Set(['speak', 'listen']);
const NETWORK_PERMISSION_PATTERN = /^[a-z0-9][a-z0-9._-]{1,40}$/;
const EVENT_PERMISSION_PATTERN = /^(subscribe|publish):[A-Za-z0-9.*>_-]+(?:\.[A-Za-z0-9.*>_-]+)*$/;

export interface PermissionCheckOptions {
  moduleId: string;
  env?: NodeJS.ProcessEnv;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

interface PolicyEngineModule {
  createPolicyClient?: () => {
    evaluatePolicy?: (request: {
      subject: string;
      action: string;
      resource: string;
      context: Record<string, unknown>;
    }) => Promise<{ allowed: boolean; reason?: string }>;
  };
}

function parseEventPermission(
  permission: string,
): { action: 'subscribe' | 'publish'; topic: string } | null {
  const parts = permission.split(':', 2);
  if (parts.length !== 2) {
    return null;
  }
  const action = parts[0];
  const topic = parts[1];
  if (!action || !topic || (action !== 'subscribe' && action !== 'publish')) {
    return null;
  }
  return {
    action,
    topic,
  };
}

function validatePermissionShape(permissions: LifeOSManifestPermissions): string[] {
  const errors: string[] = [];

  for (const permission of permissions.graph) {
    if (!ALLOWED_GRAPH_PERMISSIONS.has(permission)) {
      errors.push(`graph permission "${permission}" is not allowed`);
    }
  }

  for (const permission of permissions.voice) {
    if (!ALLOWED_VOICE_PERMISSIONS.has(permission)) {
      errors.push(`voice permission "${permission}" is not allowed`);
    }
  }

  for (const permission of permissions.network) {
    if (!NETWORK_PERMISSION_PATTERN.test(permission)) {
      errors.push(`network permission "${permission}" is malformed`);
    }
  }

  for (const permission of permissions.events) {
    if (!EVENT_PERMISSION_PATTERN.test(permission)) {
      errors.push(`event permission "${permission}" must be subscribe:<topic> or publish:<topic>`);
      continue;
    }

    const parsed = parseEventPermission(permission);
    if (!parsed) {
      errors.push(`event permission "${permission}" is malformed`);
      continue;
    }

    if (parsed.action === 'publish' && (parsed.topic.includes('*') || parsed.topic.includes('>'))) {
      errors.push(
        `event permission "${permission}" is too broad; publish permissions cannot contain "*" or ">"`,
      );
    }
  }

  return errors;
}

export async function checkPermissions(
  permissions: LifeOSManifestPermissions,
  options: PermissionCheckOptions,
): Promise<PermissionCheckResult> {
  const shapeErrors = validatePermissionShape(permissions);
  if (shapeErrors.length > 0) {
    return {
      allowed: false,
      reason: shapeErrors.join('; '),
    };
  }

  const enforcePolicy = (options.env?.LIFEOS_POLICY_ENFORCE ?? '').trim().toLowerCase() === 'true';
  if (!enforcePolicy) {
    return {
      allowed: true,
    };
  }

  const policyEngineModuleName = '@lifeos/policy-engine';
  try {
    const policyEngine = (await import(policyEngineModuleName)) as PolicyEngineModule;
    const policyClient = policyEngine.createPolicyClient?.();
    if (!policyClient?.evaluatePolicy) {
      return {
        allowed: false,
        reason: 'policy engine does not expose evaluatePolicy',
      };
    }
    const result = await policyClient.evaluatePolicy({
      subject: options.moduleId,
      action: 'module.load',
      resource: 'lifeos.module',
      context: {
        permissions,
      },
    });
    return {
      allowed: result.allowed,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      allowed: false,
      reason: `policy check failed: ${message}`,
    };
  }
}
