export class SecretCache {
    cache = new Map();
    get(name) {
        const entry = this.cache.get(name);
        if (!entry) {
            return undefined;
        }
        if (Date.now() >= entry.expiresAt) {
            this.cache.delete(name);
            return undefined;
        }
        return entry.value;
    }
    set(name, value, ttlMs) {
        this.cache.set(name, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }
    invalidate(name) {
        this.cache.delete(name);
    }
}
