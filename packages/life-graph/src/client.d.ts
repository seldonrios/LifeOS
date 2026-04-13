import { type LifeGraphManagerOptions } from './manager';
import type { LifeGraphClient } from './types';
export declare class UnsupportedQueryError extends Error {
    readonly query: string;
    constructor(query: string);
}
export declare class UnsupportedLabelError extends Error {
    readonly label: string;
    constructor(label: string);
}
export declare class UnsupportedOperationError extends Error {
    constructor(operation: string);
}
export interface CreateLifeGraphClientOptions extends LifeGraphManagerOptions {
    graphPath?: string;
    reviewClient?: ReviewChatClient;
}
interface ReviewChatRequest {
    model: string;
    format: 'json';
    options: {
        temperature: number;
        num_ctx: number;
    };
    messages: Array<{
        role: 'system' | 'user';
        content: string;
    }>;
}
interface ReviewChatResponse {
    message: {
        content: string;
    };
}
interface ReviewChatClient {
    chat(request: ReviewChatRequest): Promise<ReviewChatResponse>;
}
export declare function createLifeGraphClient(options?: CreateLifeGraphClientOptions): LifeGraphClient;
export {};
