import { type HouseholdVoiceCaptureCreated } from '@lifeos/contracts';
import { type ManagedEventBus } from '@lifeos/event-bus';
import type { AudioTranscriptionAdapter } from '@lifeos/voice-core';
export type VoiceSessionFailureReason = 'quiet_hours' | 'transcription_failed' | 'empty_transcript' | 'expired';
export type VoiceSessionStatus = 'started' | 'completed' | 'failed' | 'closed';
export interface VoiceSessionRecord {
    sessionId: string;
    householdId: string;
    surfaceId: string;
    actorUserId: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    status: VoiceSessionStatus;
    transcript?: string;
    targetHint?: HouseholdVoiceCaptureCreated['targetHint'];
    captureId?: string;
    audioRef?: string | null;
    failureReason?: VoiceSessionFailureReason;
    failureDetail?: string;
}
export interface VoiceSessionManagerOptions {
    eventBus: ManagedEventBus;
    transcriptionAdapter: AudioTranscriptionAdapter;
    now?: () => Date;
    idFactory?: () => string;
    sessionTtlMs?: number;
    retainAudio?: boolean;
}
export interface StartVoiceSessionInput {
    householdId: string;
    surfaceId: string;
    actorUserId: string;
    audioBuffer: Buffer;
    quietHoursActive: boolean;
}
export type StartVoiceSessionResult = {
    status: 'completed';
    session: VoiceSessionRecord;
    capture: HouseholdVoiceCaptureCreated;
} | {
    status: 'failed';
    session: VoiceSessionRecord;
    reason: VoiceSessionFailureReason;
};
export declare class VoiceSessionManager {
    private readonly sessions;
    private readonly retainedAudio;
    private readonly eventBus;
    private readonly transcriptionAdapter;
    private readonly now;
    private readonly idFactory;
    private readonly sessionTtlMs;
    private readonly retainAudio;
    constructor(options: VoiceSessionManagerOptions);
    getSession(sessionId: string): VoiceSessionRecord | null;
    listSessions(): VoiceSessionRecord[];
    startSession(input: StartVoiceSessionInput): Promise<StartVoiceSessionResult>;
    expireSessions(now?: Date): Promise<string[]>;
    closeSession(sessionId: string): VoiceSessionRecord | null;
    private retainSessionAudio;
    private publishStarted;
    private publishCompleted;
    private markFailed;
    private createEvent;
}
