export declare function generateInviteToken(): string;
export declare function generateInviteExpiry(ttlMs?: number): string;
export declare function isInviteExpired(expiresAt: string): boolean;
