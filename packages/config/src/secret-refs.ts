import {
  applySecretPolicy,
  type SecretRef,
  type SecretStore,
} from '@lifeos/secrets';

import {
  ConfigError,
  type FeatureEnabledPredicate,
  type ResolveSecretRefsResult,
} from './types';

const SECRET_REF_PATTERN = /^!secret\s+(.+)$/;

function formatPath(pathSegments: Array<string | number>): string {
  return pathSegments.reduce<string>((output, segment) => {
    if (typeof segment === 'number') {
      return `${output}[${segment}]`;
    }

    return output ? `${output}.${segment}` : segment;
  }, '');
}

export async function resolveSecretRefs<T extends object>(
  config: T,
  secretStore: SecretStore,
  secretRefs: SecretRef[] = [],
  isFeatureEnabled?: FeatureEnabledPredicate,
): Promise<ResolveSecretRefsResult<T>> {
  const degraded = [] as ResolveSecretRefsResult<T>['degraded'];
  const degradedPaths = [] as ResolveSecretRefsResult<T>['degradedPaths'];
  const secretOutcomes = [] as ResolveSecretRefsResult<T>['secretOutcomes'];
  const secretRefMap = new Map(secretRefs.map((secretRef) => [secretRef.name, secretRef]));

  async function walk(
    value: unknown,
    path: string,
    pathSegments: Array<string | number>,
  ): Promise<unknown> {
    if (typeof value === 'string') {
      const match = value.match(SECRET_REF_PATTERN);
      if (!match) {
        return value;
      }

      const secretName = match[1]?.trim();
      if (!secretName) {
        throw new ConfigError(`Invalid secret reference at ${path}.`);
      }

      const secretRef = secretRefMap.get(secretName);
      const resolved = await secretStore.get(secretName);
      if (!secretRef) {
        if (resolved === null) {
          throw new ConfigError(`Unable to resolve required secret '${secretName}' at ${path}.`);
        }
        return resolved;
      }

      const featureEnabled =
        secretRef.policy === 'required_if_feature_enabled' && secretRef.featureGate
          ? await isFeatureEnabled?.(secretRef.featureGate)
          : undefined;
      const policyOutcome = applySecretPolicy(secretRef, resolved, featureEnabled);

      if (typeof policyOutcome !== 'string') {
        degraded.push(policyOutcome);
        degradedPaths.push(formatPath(pathSegments));
        secretOutcomes.push({
          name: secretName,
          path: formatPath(pathSegments),
          status: 'degraded',
          marker: policyOutcome,
        });
        return undefined;
      }

      secretOutcomes.push({
        name: secretName,
        path: formatPath(pathSegments),
        status: 'resolved',
        value: policyOutcome,
      });

      return policyOutcome;
    }

    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        output.push(await walk(value[index], `${path}[${index}]`, [...pathSegments, index]));
      }
      return output;
    }

    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value)) {
        output[key] = await walk(
          nested,
          path ? `${path}.${key}` : key,
          [...pathSegments, key],
        );
      }
      return output;
    }

    return value;
  }

  return {
    config: (await walk(config, 'config', [])) as T,
    degraded,
    degradedPaths,
    secretOutcomes,
  };
}
