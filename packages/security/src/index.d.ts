export * from './types';
import type { JwtPayload, SecurityClient, ServiceToken } from './types';
export declare class JwtService {
    private readonly issuer;
    private readonly audience;
    private readonly secret;
    private readonly expiresInSeconds;
    constructor();
    private validateSigningSecret;
    issue(payload: {
        sub: string;
        service_id: string;
        module_id?: string;
        scopes: string[];
    }): Promise<ServiceToken>;
    verify(token: string): Promise<JwtPayload | null>;
}
export declare function createSecurityClient(): SecurityClient;
