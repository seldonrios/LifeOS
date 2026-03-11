interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class SecretCache {
  private readonly cache = new Map<string, CacheEntry>();

  get(name: string): string | undefined {
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

  set(name: string, value: string, ttlMs: number): void {
    this.cache.set(name, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  invalidate(name: string): void {
    this.cache.delete(name);
  }
}
