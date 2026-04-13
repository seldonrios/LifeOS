import { randomBytes } from 'node:crypto';
const DEFAULT_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export function generateInviteToken() {
    return randomBytes(32).toString('hex');
}
export function generateInviteExpiry(ttlMs = DEFAULT_INVITE_TTL_MS) {
    return new Date(Date.now() + ttlMs).toISOString();
}
export function isInviteExpired(expiresAt) {
    return new Date(expiresAt).getTime() <= Date.now();
}
