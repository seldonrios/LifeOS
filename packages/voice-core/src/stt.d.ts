export interface TranscriptEvent {
    text: string;
    confidence: number;
}
export type TranscriptHandler = (event: TranscriptEvent) => Promise<void> | void;
export interface SpeechRecognitionAdapter {
    start(onTranscript: TranscriptHandler): Promise<void>;
    stop(): Promise<void>;
}
export interface AudioTranscriptionAdapter {
    transcribe(audioBuffer: Buffer): Promise<string>;
}
export declare function pcm16ToWav(audioBuffer: Buffer, sampleRate: number, channels: number): Buffer;
export declare class UnsupportedVoicePlatformError extends Error {
    constructor(message?: string);
}
export interface SystemSpeechRecognitionAdapterOptions {
    locale?: string;
    powershellPath?: string;
    sampleRate?: number;
    channels?: number;
    logger?: (message: string) => void;
    startupTimeoutMs?: number;
    transcriptionTimeoutMs?: number;
    stopTimeoutMs?: number;
}
export declare class SystemSpeechRecognitionAdapter implements SpeechRecognitionAdapter, AudioTranscriptionAdapter {
    private process;
    private stdout;
    private readonly locale;
    private readonly powershellPath;
    private readonly sampleRate;
    private readonly channels;
    private readonly logger;
    private readonly startupTimeoutMs;
    private readonly transcriptionTimeoutMs;
    private readonly stopTimeoutMs;
    constructor(options?: SystemSpeechRecognitionAdapterOptions);
    start(onTranscript: TranscriptHandler): Promise<void>;
    stop(): Promise<void>;
    transcribe(audioBuffer: Buffer): Promise<string>;
    private runPowerShellScript;
}
export interface SpeechToTextOptions {
    adapter?: SpeechRecognitionAdapter & AudioTranscriptionAdapter;
}
export declare class SpeechToText {
    private readonly adapter;
    constructor(options?: SpeechToTextOptions);
    start(onTranscript: TranscriptHandler): Promise<void>;
    transcribe(audioBuffer: Buffer): Promise<string>;
    stop(): Promise<void>;
}
