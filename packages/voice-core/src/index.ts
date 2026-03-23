export * from './intent-router';
export * from './stt';
export * from './tts';
export * from './wake-word';

import { Topics } from '@lifeos/event-bus';

import {
  IntentRouter,
  type IntentOutcome,
  type IntentRouterOptions,
  type VoiceEventPublisher,
} from './intent-router';
import { SpeechToText, type SpeechToTextOptions, type TranscriptEvent } from './stt';
import { TextToSpeech, type TextToSpeechOptions } from './tts';
import { WakeWordDetector, type WakeWordDetectorOptions } from './wake-word';

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
  private listeningUntil: number | null = null;

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
    const routerOptions: IntentRouterOptions = {
      publish: this.publish,
      now: this.now,
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
    this.logger = options.logger ?? (() => undefined);
  }

  getWakePhrase(): string {
    return this.detector.getPrimaryWakePhrase();
  }

  async start(): Promise<void> {
    await this.stt.start(async (event) => {
      await this.processTranscript(event);
    });
  }

  async runDemo(text: string): Promise<IntentOutcome | null> {
    return this.processTranscript({
      text,
      confidence: 1,
    });
  }

  async close(): Promise<void> {
    await this.stt.stop();
  }

  private async processTranscript(event: TranscriptEvent): Promise<IntentOutcome | null> {
    const spokenText = event.text.trim();
    if (!spokenText) {
      return null;
    }

    const detected = this.detector.detect(spokenText);
    if (detected.kind === 'wake_only') {
      this.listeningUntil = this.now().getTime() + this.armedTimeoutMs;
      await this.publish(
        Topics.lifeos.voiceWakeDetected,
        {
          text: spokenText,
          confidence: event.confidence,
        },
        'voice-core',
      );
      await this.tts.speak('Listening.');
      return null;
    }

    const nowMs = this.now().getTime();
    const armed = this.listeningUntil !== null && nowMs <= this.listeningUntil;
    const commandText =
      detected.kind === 'wake_with_command' ? detected.command : armed ? spokenText : null;

    if (!commandText) {
      return null;
    }

    this.listeningUntil = null;
    this.logger(`[voice] command heard: ${commandText}`);
    await this.publish(
      Topics.lifeos.voiceCommandReceived,
      {
        text: commandText,
        transcript: spokenText,
        confidence: event.confidence,
      },
      'voice-core',
    );

    const outcome = await this.router.handleCommand(commandText);
    if (outcome.responseText) {
      await this.tts.speak(outcome.responseText);
    }

    return outcome;
  }
}

export function createVoiceCore(options: VoiceCoreOptions = {}): VoiceCore {
  return new VoiceCore(options);
}
