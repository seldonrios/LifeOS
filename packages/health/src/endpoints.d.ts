import { HealthRegistry } from './registry';
interface HandlerResponse {
    status: number;
    body: Record<string, unknown>;
}
export declare function livenessHandler(registry: HealthRegistry): () => Promise<HandlerResponse>;
export declare function readinessHandler(registry: HealthRegistry): () => Promise<HandlerResponse>;
export declare function startupHandler(registry: HealthRegistry): () => Promise<HandlerResponse>;
export {};
