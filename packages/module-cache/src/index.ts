export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheManager<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  set(key: string, value: T, ttlMs: number): void {
    const expiresAt = this.now() + Math.max(1, ttlMs);
    this.cache.set(key, { value, expiresAt });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
