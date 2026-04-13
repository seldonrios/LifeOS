import { type AudioTranscriptionAdapter } from './stt';
export type WhisperHealthStatus = 'healthy' | 'degraded' | 'unavailable';
export interface WhisperHealthSnapshot {
    status: WhisperHealthStatus;
    configured: boolean;
    checkedAt: string;
    reason?: string;
    latencyMs?: number;
}
export interface WhisperSttAdapterOptions {
    endpoint?: string;
    timeoutMs?: number;
    sampleRate?: number;
    channels?: number;
    fetchImpl?: typeof fetch;
    now?: () => Date;
}
export declare class WhisperUnavailableError extends Error {
    constructor(message?: string);
}
export declare class WhisperSttAdapter implements AudioTranscriptionAdapter {
    private readonly endpoint;
    private readonly timeoutMs;
    private readonly sampleRate;
    private readonly channels;
    private readonly fetchImpl;
    private readonly now;
    constructor(options?: WhisperSttAdapterOptions);
    isConfigured(): boolean;
    transcribe(audioBuffer: Buffer): Promise<string>;
    checkHealth(): Promise<WhisperHealthSnapshot>;
    private request;
}
