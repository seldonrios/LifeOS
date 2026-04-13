import { SecretsError } from './types';
export function applySecretPolicy(ref, value, featureEnabled) {
    const pathDetails = ref.configPath ? ` at ${ref.configPath}` : '';
    if (ref.policy === 'required') {
        if (value === null) {
            throw new SecretsError(`Missing required secret '${ref.name}'${pathDetails}.`);
        }
        return value;
    }
    if (ref.policy === 'optional') {
        if (value === null) {
            return {
                degraded: true,
                reason: `Optional secret '${ref.name}' is unavailable${pathDetails}.`,
            };
        }
        return value;
    }
    if (featureEnabled === true) {
        if (value === null) {
            throw new SecretsError(`Missing required secret '${ref.name}' for enabled feature '${ref.featureGate ?? 'unknown'}'${pathDetails}.`);
        }
        return value;
    }
    if (value === null) {
        return {
            degraded: true,
            reason: `Secret '${ref.name}' is not loaded because feature '${ref.featureGate ?? 'unknown'}' is disabled${pathDetails}.`,
        };
    }
    return value;
}
