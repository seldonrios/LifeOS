import { randomUUID } from 'node:crypto';
import { HomeNodeVoiceSessionCompletedSchema, HomeNodeVoiceSessionFailedSchema, HomeNodeVoiceSessionStartedSchema, HouseholdVoiceCaptureCreatedSchema, } from '@lifeos/contracts';
import { Topics } from '@lifeos/event-bus';
const DEFAULT_SESSION_TTL_MS = 60_000;
function cloneSession(session) {
    return { ...session };
}
function isSessionActive(status) {
    return status === 'started';
}
function deriveTargetHint(text) {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
        return 'unknown';
    }
    if (/(\bshopping\b|\bbuy\b|\bpick up\b|\bgrocer(?:y|ies)\b|\bstore\b)/.test(normalized)) {
        return 'shopping';
    }
    if (/(\bchore\b|\bclean\b|\btidy\b|\bvacuum\b|\bdishes\b|\blaundry\b)/.test(normalized)) {
        return 'chore';
    }
    if (/(\bremind\b|\breminder\b|\bremember\b|\bdon't forget\b|\bdont forget\b)/.test(normalized)) {
        return 'reminder';
    }
    if (/(\bnote\b|\bjot\b|\bwrite down\b|\bcapture\b)/.test(normalized)) {
        return 'note';
    }
    return 'unknown';
}
export class VoiceSessionManager {
    sessions = new Map();
    retainedAudio = new Map();
    eventBus;
    transcriptionAdapter;
    now;
    idFactory;
    sessionTtlMs;
    retainAudio;
    constructor(options) {
        this.eventBus = options.eventBus;
        this.transcriptionAdapter = options.transcriptionAdapter;
        this.now = options.now ?? (() => new Date());
        this.idFactory = options.idFactory ?? randomUUID;
        this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
        this.retainAudio = options.retainAudio ?? false;
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? cloneSession(session) : null;
    }
    listSessions() {
        return [...this.sessions.values()].map((session) => cloneSession(session));
    }
    async startSession(input) {
        const createdAt = this.now().toISOString();
        const sessionId = this.idFactory();
        const session = {
            sessionId,
            householdId: input.householdId,
            surfaceId: input.surfaceId,
            actorUserId: input.actorUserId,
            createdAt,
            updatedAt: createdAt,
            expiresAt: new Date(new Date(createdAt).getTime() + this.sessionTtlMs).toISOString(),
            status: 'started',
        };
        this.sessions.set(sessionId, session);
        await this.publishStarted(session);
        if (input.quietHoursActive) {
            const failedSession = await this.markFailed(session, 'quiet_hours', 'Voice capture blocked during quiet hours.');
            return { status: 'failed', session: failedSession, reason: 'quiet_hours' };
        }
        try {
            const transcript = (await this.transcriptionAdapter.transcribe(input.audioBuffer)).trim();
            // Session may have been expired while transcription was in flight.
            if (!isSessionActive(session.status)) {
                return {
                    status: 'failed',
                    session: cloneSession(session),
                    reason: session.failureReason ?? 'expired',
                };
            }
            if (!transcript) {
                const failedSession = await this.markFailed(session, 'empty_transcript', 'Whisper produced an empty transcript.');
                return { status: 'failed', session: failedSession, reason: 'empty_transcript' };
            }
            const audioRef = this.retainAudio ? this.retainSessionAudio(session.sessionId, input.audioBuffer) : null;
            const targetHint = deriveTargetHint(transcript);
            const capture = HouseholdVoiceCaptureCreatedSchema.parse({
                captureId: this.idFactory(),
                householdId: input.householdId,
                actorUserId: input.actorUserId,
                text: transcript,
                audioRef,
                source: 'ha_satellite',
                sourceDeviceId: input.surfaceId,
                targetHint,
                createdAt: this.now().toISOString(),
            });
            await this.eventBus.publish(Topics.lifeos.householdVoiceCaptureCreated, this.createEvent(Topics.lifeos.householdVoiceCaptureCreated, capture, input.householdId, input.surfaceId));
            session.status = 'completed';
            session.updatedAt = this.now().toISOString();
            session.transcript = transcript;
            session.targetHint = targetHint;
            session.captureId = capture.captureId;
            session.audioRef = capture.audioRef;
            await this.publishCompleted(session, capture);
            return { status: 'completed', session: cloneSession(session), capture };
        }
        catch (error) {
            if (!isSessionActive(session.status)) {
                return {
                    status: 'failed',
                    session: cloneSession(session),
                    reason: session.failureReason ?? 'expired',
                };
            }
            const failedSession = await this.markFailed(session, 'transcription_failed', error instanceof Error ? error.message : 'Voice transcription failed.');
            return { status: 'failed', session: failedSession, reason: 'transcription_failed' };
        }
    }
    async expireSessions(now = this.now()) {
        const expiredIds = [];
        for (const session of this.sessions.values()) {
            if (!isSessionActive(session.status)) {
                continue;
            }
            if (new Date(session.expiresAt).getTime() > now.getTime()) {
                continue;
            }
            await this.markFailed(session, 'expired', 'Voice session expired before completion.');
            expiredIds.push(session.sessionId);
        }
        return expiredIds;
    }
    closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        session.status = 'closed';
        session.updatedAt = this.now().toISOString();
        this.retainedAudio.delete(sessionId);
        return cloneSession(session);
    }
    retainSessionAudio(sessionId, audioBuffer) {
        this.retainedAudio.set(sessionId, Buffer.from(audioBuffer));
        return `memory://home-node-voice/${sessionId}`;
    }
    async publishStarted(session) {
        const payload = HomeNodeVoiceSessionStartedSchema.parse({
            session_id: session.sessionId,
            household_id: session.householdId,
            surface_id: session.surfaceId,
            started_at: session.createdAt,
        });
        await this.eventBus.publish(Topics.lifeos.homeNodeVoiceSessionStarted, this.createEvent(Topics.lifeos.homeNodeVoiceSessionStarted, payload, session.householdId, session.surfaceId));
    }
    async publishCompleted(session, capture) {
        const payload = HomeNodeVoiceSessionCompletedSchema.parse({
            session_id: session.sessionId,
            household_id: session.householdId,
            surface_id: session.surfaceId,
            capture_id: capture.captureId,
            transcript: capture.text,
            target_hint: capture.targetHint,
            completed_at: session.updatedAt,
        });
        await this.eventBus.publish(Topics.lifeos.homeNodeVoiceSessionCompleted, this.createEvent(Topics.lifeos.homeNodeVoiceSessionCompleted, payload, session.householdId, session.surfaceId));
    }
    async markFailed(session, reason, detail) {
        session.status = 'failed';
        session.updatedAt = this.now().toISOString();
        session.failureReason = reason;
        session.failureDetail = detail;
        const payload = HomeNodeVoiceSessionFailedSchema.parse({
            session_id: session.sessionId,
            household_id: session.householdId,
            surface_id: session.surfaceId,
            reason,
            detail,
            failed_at: session.updatedAt,
        });
        await this.eventBus.publish(Topics.lifeos.homeNodeVoiceSessionFailed, this.createEvent(Topics.lifeos.homeNodeVoiceSessionFailed, payload, session.householdId, session.surfaceId));
        return cloneSession(session);
    }
    createEvent(type, data, householdId, actorId) {
        return {
            id: this.idFactory(),
            type,
            timestamp: this.now().toISOString(),
            source: 'home-node-voice-session-manager',
            version: '1',
            data,
            metadata: {
                household_id: householdId,
                actor_id: actorId,
                trace_id: this.idFactory(),
            },
        };
    }
}
