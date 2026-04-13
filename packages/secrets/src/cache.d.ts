export declare class SecretCache {
    private readonly cache;
    get(name: string): string | undefined;
    set(name: string, value: string, ttlMs: number): void;
    invalidate(name: string): void;
}
