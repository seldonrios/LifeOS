import { setTimeout as delay } from 'node:timers/promises';

export class AudioRecorderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioRecorderError';
  }
}

export interface AudioRecorderOptions {
  sampleRate?: number;
  channels?: number;
  endGraceMs?: number;
  maxSeconds?: number;
  logger?: (message: string) => void;
}

interface NodeRecordSession {
  stream(): NodeJS.ReadableStream;
  stop(): void;
}

interface NodeRecordModule {
  record(options: { sampleRate: number; channels: number }): NodeRecordSession;
}

let cachedNodeRecordModule: Promise<NodeRecordModule> | null = null;

function resolveNodeRecordModule(moduleLike: unknown): NodeRecordModule | null {
  if (
    moduleLike &&
    typeof moduleLike === 'object' &&
    'record' in moduleLike &&
    typeof (moduleLike as { record?: unknown }).record === 'function'
  ) {
    return moduleLike as NodeRecordModule;
  }

  return null;
}

async function loadNodeRecordModule(): Promise<NodeRecordModule> {
  if (!cachedNodeRecordModule) {
    cachedNodeRecordModule = (async () => {
      let recorderModuleLike: unknown;
      try {
        recorderModuleLike = await import('node-record-lpcm16');
      } catch {
        throw new AudioRecorderError(
          'Missing `node-record-lpcm16` dependency. Install with: pnpm add node-record-lpcm16 -F @lifeos/voice-core',
        );
      }

      const resolved =
        resolveNodeRecordModule((recorderModuleLike as { default?: unknown }).default) ??
        resolveNodeRecordModule(recorderModuleLike);
      if (!resolved) {
        throw new AudioRecorderError('Unable to initialize node-record-lpcm16.');
      }
      return resolved;
    })();
  }

  return cachedNodeRecordModule;
}

export class AudioRecorder {
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly endGraceMs: number;
  private readonly maxSeconds: number;
  private readonly logger: (message: string) => void;

  constructor(options: AudioRecorderOptions = {}) {
    this.sampleRate = options.sampleRate ?? 16000;
    this.channels = options.channels ?? 1;
    this.endGraceMs = options.endGraceMs ?? 500;
    this.maxSeconds = options.maxSeconds ?? 12;
    this.logger = options.logger ?? (() => undefined);
  }

  async record(seconds = 4): Promise<Buffer> {
    if (!Number.isFinite(this.sampleRate) || this.sampleRate <= 0) {
      throw new AudioRecorderError('Recorder sampleRate must be a positive number.');
    }
    if (!Number.isFinite(this.channels) || this.channels <= 0) {
      throw new AudioRecorderError('Recorder channels must be a positive number.');
    }
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new AudioRecorderError('Recording duration must be a positive number.');
    }
    if (seconds > this.maxSeconds) {
      throw new AudioRecorderError(`Recording duration exceeds safety max (${this.maxSeconds}s).`);
    }

    const resolved = await loadNodeRecordModule();

    return new Promise<Buffer>((resolve, reject) => {
      let settled = false;
      const chunks: Buffer[] = [];
      let finalizeTimer: ReturnType<typeof setTimeout> | null = null;

      const finishResolve = (buffer: Buffer): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (finalizeTimer) {
          clearTimeout(finalizeTimer);
        }
        if (buffer.length === 0) {
          reject(new AudioRecorderError('Microphone recording produced no audio.'));
          return;
        }
        resolve(buffer);
      };

      const finishReject = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (finalizeTimer) {
          clearTimeout(finalizeTimer);
        }
        const message = error instanceof Error ? error.message : String(error);
        reject(new AudioRecorderError(`Microphone recording failed: ${message}`));
      };

      let session: NodeRecordSession;
      try {
        session = resolved.record({
          sampleRate: this.sampleRate,
          channels: this.channels,
        });
      } catch (error: unknown) {
        finishReject(error);
        return;
      }

      const stream = session.stream();
      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.once('error', (error) => {
        finishReject(error);
      });
      stream.once('end', () => {
        finishResolve(Buffer.concat(chunks));
      });

      void (async () => {
        await delay(Math.ceil(seconds * 1000));
        try {
          session.stop();
        } catch (error: unknown) {
          finishReject(error);
          return;
        }

        finalizeTimer = setTimeout(() => {
          this.logger('[voice.recorder] stream end timeout, resolving with buffered audio.');
          finishResolve(Buffer.concat(chunks));
        }, this.endGraceMs);
      })();
    });
  }
}
