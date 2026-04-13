import { pcm16ToWav } from './stt';
const DEFAULT_WHISPER_TIMEOUT_MS = 8_000;
const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHANNELS = 1;
function toOptionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
export class WhisperUnavailableError extends Error {
    constructor(message = 'Whisper STT runtime is not configured or unavailable.') {
        super(message);
        this.name = 'WhisperUnavailableError';
    }
}
export class WhisperSttAdapter {
    endpoint;
    timeoutMs;
    sampleRate;
    channels;
    fetchImpl;
    now;
    constructor(options = {}) {
        this.endpoint = options.endpoint?.trim() || process.env.LIFEOS_WHISPER_ENDPOINT?.trim() || '';
        this.timeoutMs =
            options.timeoutMs ??
                Number(process.env.LIFEOS_WHISPER_TIMEOUT_MS || DEFAULT_WHISPER_TIMEOUT_MS);
        this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
        this.channels = options.channels ?? DEFAULT_CHANNELS;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? (() => new Date());
    }
    isConfigured() {
        return this.endpoint.length > 0;
    }
    async transcribe(audioBuffer) {
        if (!this.isConfigured()) {
            throw new WhisperUnavailableError();
        }
        if (audioBuffer.length === 0) {
            return '';
        }
        const waveBuffer = pcm16ToWav(audioBuffer, this.sampleRate, this.channels);
        const response = await this.request(this.endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                audioBase64: waveBuffer.toString('base64'),
                mimeType: 'audio/wav',
                sampleRate: this.sampleRate,
                channels: this.channels,
            }),
        });
        const payload = (await response.json());
        if (typeof payload.text !== 'string') {
            throw new WhisperUnavailableError('Whisper endpoint returned an invalid transcript payload.');
        }
        return payload.text.trim();
    }
    async checkHealth() {
        const checkedAt = this.now().toISOString();
        if (!this.isConfigured()) {
            return {
                status: 'unavailable',
                configured: false,
                checkedAt,
                reason: 'whisper endpoint is not configured',
            };
        }
        const startedAt = Date.now();
        try {
            const response = await this.request(this.endpoint, { method: 'GET' });
            const payload = (await response.json());
            const status = payload.status;
            const latencyMs = Date.now() - startedAt;
            if (status === 'healthy' || status === 'degraded' || status === 'unavailable') {
                return {
                    status,
                    configured: true,
                    checkedAt,
                    reason: toOptionalString(payload.reason),
                    latencyMs,
                };
            }
            return {
                status: 'healthy',
                configured: true,
                checkedAt,
                latencyMs,
            };
        }
        catch (error) {
            return {
                status: 'degraded',
                configured: true,
                checkedAt,
                reason: error instanceof Error ? error.message : 'whisper health probe failed',
            };
        }
    }
    async request(url, init) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(url, {
                ...init,
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new WhisperUnavailableError(`Whisper endpoint request failed with status ${response.status}.`);
            }
            return response;
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new WhisperUnavailableError(`Whisper endpoint request timed out after ${this.timeoutMs}ms.`);
            }
            if (error instanceof WhisperUnavailableError) {
                throw error;
            }
            throw new WhisperUnavailableError(error instanceof Error ? error.message : 'whisper endpoint request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
