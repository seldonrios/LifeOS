export interface SpeechSynthesisAdapter {
    speak(text: string): Promise<void>;
}
export interface PowerShellSpeechSynthesisAdapterOptions {
    powershellPath?: string;
    timeoutMs?: number;
    logger?: (message: string) => void;
}
export declare class PowerShellSpeechSynthesisAdapter implements SpeechSynthesisAdapter {
    private readonly powershellPath;
    private readonly timeoutMs;
    private readonly logger;
    constructor(options?: PowerShellSpeechSynthesisAdapterOptions);
    speak(text: string): Promise<void>;
}
export declare class NullSpeechSynthesisAdapter implements SpeechSynthesisAdapter {
    speak(text: string): Promise<void>;
}
export interface TextToSpeechOptions {
    adapter?: SpeechSynthesisAdapter;
}
export declare class TextToSpeech {
    private readonly adapter;
    private pending;
    constructor(options?: TextToSpeechOptions);
    speak(text: string): Promise<void>;
}
