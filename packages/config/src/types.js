export const LIFEOS_ENV_PREFIX = 'LIFEOS__';
export class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
    }
}
