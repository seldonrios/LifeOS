export interface WakeWordMatch {
    kind: 'none' | 'wake_only' | 'wake_with_command';
    matchedPhrase?: string;
    command?: string;
}
export interface WakeWordDetectorOptions {
    wakePhrases?: string[];
}
export declare class WakeWordDetector {
    private readonly wakePhrases;
    private readonly patterns;
    constructor(options?: WakeWordDetectorOptions);
    detect(text: string): WakeWordMatch;
    getPrimaryWakePhrase(): string;
}
