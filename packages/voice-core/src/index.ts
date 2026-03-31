export * from './consent-manager';
export * from './audio-recorder';
export * from './intent-router';
export * from './stt';
export * from './whisper-adapter';
export * from './tts';
export * from './wake-word';

import { Topics } from '@lifeos/event-bus';

import { AudioRecorder, type AudioRecorderOptions } from './audio-recorder';
import { MissingMicrophoneConsentError, consent, type ConsentManager } from './consent-manager';
import {
  IntentRouter,
  type IntentOutcome,
  type IntentRouterOptions,
  type VoiceEventPublisher,
} from './intent-router';
import { SpeechToText, type SpeechToTextOptions, type TranscriptEvent } from './stt';
import { TextToSpeech, type TextToSpeechOptions } from './tts';
import { WakeWordDetector, type WakeWordDetectorOptions } from './wake-word';

const MAX_COMMAND_TEXT_CHARS = 600;
const MAX_TRANSCRIPT_TEXT_CHARS = 2000;
const DEFAULT_WAKE_AUDIO_SECONDS = 5;

function normalizeWakeAudioSeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WAKE_AUDIO_SECONDS;
  }
  return Math.max(1, Math.min(10, Math.round(value as number)));
}

export interface VoiceCoreOptions {
  env?: NodeJS.ProcessEnv;
  graphPath?: string;
  armedTimeoutMs?: number;
  logger?: (message: string) => void;
  publish?: VoiceEventPublisher;
  now?: () => Date;
  router?: IntentRouter;
  routerOptions?: IntentRouterOptions;
  speechToText?: SpeechToText;
  speechToTextOptions?: SpeechToTextOptions;
  textToSpeech?: TextToSpeech;
  textToSpeechOptions?: TextToSpeechOptions;
  wakeWordDetector?: WakeWordDetector;
  wakeWordDetectorOptions?: WakeWordDetectorOptions;
  consentManager?: Pick<ConsentManager, 'hasConsent'>;
  audioRecorder?: AudioRecorder;
  audioRecorderOptions?: AudioRecorderOptions;
  captureWakeAudio?: boolean;
  wakeAudioSeconds?: number;
}

export class VoiceCore {
  private readonly detector: WakeWordDetector;
  private readonly stt: SpeechToText;
  private readonly router: IntentRouter;
  private readonly tts: TextToSpeech;
  private readonly armedTimeoutMs: number;
  private readonly logger: (message: string) => void;
  private readonly publish: VoiceEventPublisher;
  private readonly now: () => Date;
  private readonly consentManager: Pick<ConsentManager, 'hasConsent'>;
  private readonly audioRecorder: AudioRecorder;
  private readonly captureWakeAudio: boolean;
  private readonly wakeAudioSeconds: number;
  private capturingWakeCommand = false;
  private listeningUntil: number | null = null;
  private started = false;
  private closed = false;
  private wakeCaptureTask: Promise<IntentOutcome | null> | null = null;

  constructor(options: VoiceCoreOptions = {}) {
    this.detector =
      options.wakeWordDetector ?? new WakeWordDetector(options.wakeWordDetectorOptions);
    this.stt = options.speechToText ?? new SpeechToText(options.speechToTextOptions);
    this.tts = options.textToSpeech ?? new TextToSpeech(options.textToSpeechOptions);
    this.publish =
      options.publish ??
      options.routerOptions?.publish ??
      (async () => {
        return;
      });
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? (() => undefined);
    const routerOptions: IntentRouterOptions = {
      publish: this.publish,
      now: this.now,
      logger: this.logger,
      ...(options.routerOptions ?? {}),
    };
    if (options.env) {
      routerOptions.env = options.env;
    }
    if (options.graphPath) {
      routerOptions.graphPath = options.graphPath;
    }
    this.router = options.router ?? new IntentRouter(routerOptions);
    this.armedTimeoutMs = options.armedTimeoutMs ?? 10_000;
    this.consentManager = options.consentManager ?? consent;
    this.audioRecorder = options.audioRecorder ?? new AudioRecorder(options.audioRecorderOptions);
    const envCaptureWakeAudio = options.env?.LIFEOS_VOICE_CAPTURE_WAKE_AUDIO?.trim();
    this.captureWakeAudio =
      options.captureWakeAudio ?? (envCaptureWakeAudio ? envCaptureWakeAudio !== '0' : true);
    this.wakeAudioSeconds = normalizeWakeAudioSeconds(options.wakeAudioSeconds);
  }

  getWakePhrase(): string {
    return this.detector.getPrimaryWakePhrase();
  }

  async start(): Promise<void> {
    if (this.closed) {
      throw new Error('Voice core is closed and cannot be restarted.');
    }
    if (this.started) {
      return;
    }
    if (!(await this.consentManager.hasConsent())) {
      throw new MissingMicrophoneConsentError();
    }

    await this.stt.start(async (event) => {
      if (this.closed) {
        return;
      }
      try {
        await this.processTranscript(event);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger(`[voice] transcript processing degraded: ${message}`);
      }
    });
    this.started = true;
  }

  async runDemo(text: string): Promise<IntentOutcome | null> {
    return this.processTranscript({
      text,
      confidence: 1,
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listeningUntil = null;
    this.started = false;

    try {
      await this.stt.stop();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger(`[voice] stt shutdown degraded: ${message}`);
    }

    if (this.wakeCaptureTask) {
      await this.wakeCaptureTask.catch(() => null);
      this.wakeCaptureTask = null;
    }
  }

  private async processTranscript(event: TranscriptEvent): Promise<IntentOutcome | null> {
    if (this.closed || this.capturingWakeCommand) {
      return null;
    }

    const spokenText = event.text.trim();
    if (!spokenText) {
      return null;
    }

    const detected = this.detector.detect(spokenText);
    if (detected.kind === 'wake_only') {
      await this.publishSafe(
        Topics.lifeos.voiceWakeDetected,
        {
          text: spokenText,
          confidence: event.confidence,
        },
        'voice-core',
      );
      await this.speakSafely('Listening.');

      if (this.captureWakeAudio) {
        this.wakeCaptureTask = this.onWake();
        let capturedOutcome: IntentOutcome | null = null;
        try {
          capturedOutcome = await this.wakeCaptureTask;
        } finally {
          this.wakeCaptureTask = null;
        }
        if (capturedOutcome) {
          return capturedOutcome;
        }
      }

      this.listeningUntil = this.now().getTime() + this.armedTimeoutMs;
      return null;
    }

    const nowMs = this.now().getTime();
    const armed = this.listeningUntil !== null && nowMs <= this.listeningUntil;
    const commandText =
      detected.kind === 'wake_with_command' ? detected.command : armed ? spokenText : null;

    if (!commandText) {
      return null;
    }

    return this.processCommand(commandText, spokenText, event.confidence, {
      source: detected.kind === 'wake_with_command' ? 'wake_inline' : 'armed_fallback',
    });
  }

  private async onWake(): Promise<IntentOutcome | null> {
    if (this.closed || this.capturingWakeCommand) {
      return null;
    }

    this.capturingWakeCommand = true;
    try {
      this.logger('🎤 Listening...');
      const audio = await this.audioRecorder.record(this.wakeAudioSeconds);
      const commandText = (await this.stt.transcribe(audio)).trim();
      if (!commandText) {
        this.logger(
          '[voice] wake capture produced no transcription; waiting for fallback transcript',
        );
        await this.speakSafely("I didn't catch that. Please repeat.");
        return null;
      }

      this.logger(`You said: "${commandText}"`);
      const outcome = await this.processCommand(commandText, commandText, 1, {
        source: 'audio_transcription',
        audioBytes: audio.length,
      });
      if (!outcome.responseText.trim()) {
        await this.speakSafely('Understood.');
      }
      return outcome;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger(`[voice] wake audio transcription degraded: ${message}`);
      return null;
    } finally {
      this.capturingWakeCommand = false;
    }
  }

  private async processCommand(
    commandText: string,
    transcript: string,
    confidence: number,
    metadata: Record<string, unknown> = {},
  ): Promise<IntentOutcome> {
    const normalizedCommandText = commandText.trim().slice(0, MAX_COMMAND_TEXT_CHARS);
    const normalizedTranscript = transcript.trim().slice(0, MAX_TRANSCRIPT_TEXT_CHARS);
    if (!normalizedCommandText) {
      return {
        handled: false,
        action: 'unhandled',
        responseText: "I didn't catch a command.",
      };
    }

    this.listeningUntil = null;
    this.logger(`[voice] command heard: ${normalizedCommandText}`);
    await this.publishSafe(
      Topics.lifeos.voiceCommandReceived,
      {
        text: normalizedCommandText,
        transcript: normalizedTranscript,
        confidence,
        ...metadata,
      },
      'voice-core',
    );

    let outcome: IntentOutcome;
    try {
      outcome = await this.router.handleCommand(normalizedCommandText);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger(`[voice] router degraded: ${message}`);
      await this.publishSafe(
        Topics.lifeos.voiceCommandUnhandled,
        {
          text: normalizedCommandText,
          reason: message,
        },
        'voice-core',
      );
      outcome = {
        handled: false,
        action: 'unhandled',
        responseText: 'I ran into an internal error while handling that command.',
      };
    }

    const spokenResponse = outcome.responseText.trim();
    if (spokenResponse) {
      await this.speakSafely(spokenResponse);
    }
    return outcome;
  }

  private async speakSafely(text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    try {
      await this.tts.speak(text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger(`[voice] tts degraded: ${message}`);
    }
  }

  private async publishSafe(
    topic: string,
    data: Record<string, unknown>,
    source: string,
  ): Promise<void> {
    try {
      await this.publish(topic, data, source);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger(`[voice] publish degraded topic=${topic}: ${message}`);
    }
  }
}

export function createVoiceCore(options: VoiceCoreOptions = {}): VoiceCore {
  return new VoiceCore(options);
}
