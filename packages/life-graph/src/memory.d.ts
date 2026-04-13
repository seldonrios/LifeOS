import type { LifeGraphClient, LifeGraphMemoryEntry, LifeGraphMemoryRole, LifeGraphMemorySearchOptions, LifeGraphMemorySearchResult, LifeGraphMemoryType, LifeGraphMemoryThreadOptions } from './types';
export interface MemoryEventLike {
    type?: unknown;
    data?: unknown;
}
export interface MemoryEmbeddingProvider {
    embed(text: string): Promise<number[]>;
}
export declare function createDeterministicEmbedding(text: string): number[];
export declare function cosineSimilarity(left: number[], right: number[]): number;
export declare class DeterministicEmbeddingProvider implements MemoryEmbeddingProvider {
    embed(text: string): Promise<number[]>;
}
export interface TransformersEmbeddingProviderOptions {
    modelName?: string;
    fallbackProvider?: MemoryEmbeddingProvider;
}
export declare class TransformersEmbeddingProvider implements MemoryEmbeddingProvider {
    private readonly modelName;
    private readonly fallbackProvider;
    constructor(options?: TransformersEmbeddingProviderOptions);
    embed(text: string): Promise<number[]>;
}
export interface MemoryManagerOptions {
    client: LifeGraphClient;
    embeddingProvider?: MemoryEmbeddingProvider;
    now?: () => Date;
    maxEntries?: number;
    contextDays?: number;
    contextLimit?: number;
    threadSummaryTrigger?: number;
    threadSummaryKeep?: number;
}
export interface RememberInput {
    type: LifeGraphMemoryType;
    content: string;
    relatedTo?: string[];
    role?: LifeGraphMemoryRole;
    threadId?: string;
    key?: string;
    value?: string;
    summaryOfThreadId?: string;
}
export interface ThreadMessageInput {
    content: string;
    role?: LifeGraphMemoryRole;
    type?: LifeGraphMemoryType;
    relatedTo?: string[];
    key?: string;
    value?: string;
}
export interface StartThreadOptions {
    initialMessage?: string;
    role?: LifeGraphMemoryRole;
    relatedTo?: string[];
}
export interface ConversationContextOptions extends LifeGraphMemorySearchOptions {
    threadId?: string;
    sinceDays?: number;
    limit?: number;
}
export declare class MemoryManager {
    private readonly client;
    private readonly embeddingProvider;
    private readonly now;
    private readonly maxEntries;
    private readonly contextDays;
    private readonly contextLimit;
    private readonly threadSummaryTrigger;
    private readonly threadSummaryKeep;
    constructor(options: MemoryManagerOptions);
    remember(input: RememberInput): Promise<LifeGraphMemoryEntry | null>;
    rememberEvent(event: MemoryEventLike): Promise<LifeGraphMemoryEntry | null>;
    search(query: string, options?: LifeGraphMemorySearchOptions): Promise<LifeGraphMemorySearchResult[]>;
    startThread(options?: StartThreadOptions): Promise<string>;
    addToThread(threadId: string, input: ThreadMessageInput): Promise<LifeGraphMemoryEntry | null>;
    getThread(threadId: string, options?: LifeGraphMemoryThreadOptions): Promise<LifeGraphMemoryEntry[]>;
    getRelevantContext(eventOrQuery: MemoryEventLike | string, options?: LifeGraphMemorySearchOptions): Promise<string[]>;
    getRelevantContextForCurrentConversation(query: string, options?: ConversationContextOptions): Promise<string[]>;
    getRelevantContextForToday(limit?: number): Promise<string[]>;
    summarizeThread(threadId: string): Promise<LifeGraphMemoryEntry | null>;
    trim(): Promise<void>;
    private toContextLine;
    private findLastSummaryIndex;
    private buildThreadSummary;
    private summarizeThreadIfNeeded;
}
