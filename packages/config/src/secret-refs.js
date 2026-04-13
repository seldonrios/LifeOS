import { applySecretPolicy } from '@lifeos/secrets';
import { ConfigError } from './types';
const SECRET_REF_PATTERN = /^!secret\s+(.+)$/;
function formatPath(pathSegments) {
    return pathSegments.reduce((output, segment) => {
        if (typeof segment === 'number') {
            return `${output}[${segment}]`;
        }
        return output ? `${output}.${segment}` : segment;
    }, '');
}
export async function resolveSecretRefs(config, secretStore, secretRefs = [], isFeatureEnabled) {
    const degraded = [];
    const degradedPaths = [];
    const secretOutcomes = [];
    const secretRefMap = new Map(secretRefs.map((secretRef) => [secretRef.name, secretRef]));
    async function walk(value, path, pathSegments) {
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
            const featureEnabled = secretRef.policy === 'required_if_feature_enabled' && secretRef.featureGate
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
            const output = [];
            for (let index = 0; index < value.length; index += 1) {
                output.push(await walk(value[index], `${path}[${index}]`, [...pathSegments, index]));
            }
            return output;
        }
        if (value && typeof value === 'object') {
            const output = {};
            for (const [key, nested] of Object.entries(value)) {
                output[key] = await walk(nested, path ? `${path}.${key}` : key, [...pathSegments, key]);
            }
            return output;
        }
        return value;
    }
    return {
        config: (await walk(config, 'config', [])),
        degraded,
        degradedPaths,
        secretOutcomes,
    };
}
