export declare class AudioRecorderError extends Error {
    constructor(message: string);
}
export interface AudioRecorderOptions {
    sampleRate?: number;
    channels?: number;
    endGraceMs?: number;
    maxSeconds?: number;
    logger?: (message: string) => void;
}
export declare class AudioRecorder {
    private readonly sampleRate;
    private readonly channels;
    private readonly endGraceMs;
    private readonly maxSeconds;
    private readonly logger;
    constructor(options?: AudioRecorderOptions);
    record(seconds?: number): Promise<Buffer>;
}
