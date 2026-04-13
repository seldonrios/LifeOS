export declare class MissingMicrophoneConsentError extends Error {
    constructor(message?: string);
}
export declare class ConsentManager {
    private readonly consentPath;
    constructor(consentPath?: string);
    hasConsent(): Promise<boolean>;
    grantConsent(): Promise<void>;
}
export declare const consent: ConsentManager;
