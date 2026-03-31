import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  RecognizerIntentExtraLanguageModel,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionNativeEventMap,
  type ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechRecognitionSubscription = {
  remove(): void;
};

type PendingStop = {
  resolve(): void;
  reject(error: Error): void;
};

type TranscriptWaiter = {
  resolve(): void;
  reject(error: Error): void;
};

const STOP_TIMEOUT_MS = 15_000;
const TRANSCRIPT_WAIT_TIMEOUT_MS = 3_000;

export type VoiceRecordingState = 'idle' | 'recording' | 'processing';

export type RecordingOutput = {
  uri: string;
  durationMs: number;
  transcript?: string;
};

function primaryTranscript(event: ExpoSpeechRecognitionResultEvent): string {
  return event.results[0]?.transcript?.trim() ?? '';
}

function buildSpeechError(event: ExpoSpeechRecognitionErrorEvent): string {
  if (event.error === 'not-allowed') {
    return 'Microphone and speech recognition permissions are required for voice capture.';
  }

  if (event.error === 'no-speech' || event.error === 'speech-timeout') {
    return 'No speech detected. Please try again.';
  }

  if (event.error === 'service-not-allowed' || event.error === 'language-not-supported') {
    return 'Speech recognition is unavailable on this device.';
  }

  return event.message.trim().length > 0
    ? event.message
    : 'Unable to process voice capture. Please try again.';
}

export function useVoiceRecorder() {
  const [recordingState, setRecordingState] = useState<VoiceRecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const audioUriRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const pendingStopRef = useRef<PendingStop | null>(null);
  const transcriptWaiterRef = useRef<TranscriptWaiter | null>(null);
  const suppressNextErrorRef = useRef(false);

  const clearSessionRefs = useCallback(() => {
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    audioUriRef.current = null;
    recordingStartedAtRef.current = null;
    pendingStopRef.current = null;
    transcriptWaiterRef.current = null;
    suppressNextErrorRef.current = false;
  }, []);

  useEffect(() => {
    const subscriptions: SpeechRecognitionSubscription[] = [
      ExpoSpeechRecognitionModule.addListener(
        'result',
        (event: ExpoSpeechRecognitionNativeEventMap['result']) => {
          const transcript = primaryTranscript(event);
          if (transcript.length === 0) {
            return;
          }

          transcriptRef.current = transcript;
          if (event.isFinal) {
            finalTranscriptRef.current = transcript;
            // Signal that we have received the final transcript
            const waiter = transcriptWaiterRef.current;
            if (waiter) {
              transcriptWaiterRef.current = null;
              waiter.resolve();
            }
          }
        },
      ) as SpeechRecognitionSubscription,
      ExpoSpeechRecognitionModule.addListener(
        'audioend',
        (event: ExpoSpeechRecognitionNativeEventMap['audioend']) => {
          audioUriRef.current = event.uri;
        },
      ) as SpeechRecognitionSubscription,
      ExpoSpeechRecognitionModule.addListener('nomatch', () => {
        finalTranscriptRef.current = finalTranscriptRef.current.trim();
        // Even if no match, signal completion so we don't hang waiting
        const waiter = transcriptWaiterRef.current;
        if (waiter) {
          transcriptWaiterRef.current = null;
          waiter.resolve();
        }
      }) as SpeechRecognitionSubscription,
      ExpoSpeechRecognitionModule.addListener(
        'error',
        (event: ExpoSpeechRecognitionNativeEventMap['error']) => {
          if (suppressNextErrorRef.current && event.error === 'aborted') {
            suppressNextErrorRef.current = false;
            return;
          }

          const nextError = new Error(buildSpeechError(event));
          const pendingStop = pendingStopRef.current;
          if (pendingStop) {
            pendingStopRef.current = null;
            pendingStop.reject(nextError);
            return;
          }

          setRecordingState('idle');
          setError(nextError.message);
        },
      ) as SpeechRecognitionSubscription,
      ExpoSpeechRecognitionModule.addListener('end', () => {
        const pendingStop = pendingStopRef.current;
        if (!pendingStop) {
          return;
        }

        pendingStopRef.current = null;
        pendingStop.resolve();
      }) as SpeechRecognitionSubscription,
    ];

    return () => {
      suppressNextErrorRef.current = true;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore cleanup failures when recognition is already inactive.
      }

      subscriptions.forEach((subscription) => {
        subscription.remove();
      });
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    clearSessionRefs();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setRecordingState('idle');
      setError('Speech recognition is unavailable on this device.');
      return false;
    }

    if (!ExpoSpeechRecognitionModule.supportsRecording()) {
      setRecordingState('idle');
      setError('Speech recognition recording is unavailable on this device.');
      return false;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setRecordingState('idle');
      setError('Microphone and speech recognition permissions are required for voice capture.');
      return false;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        addsPunctuation: true,
        requiresOnDeviceRecognition: Platform.OS === 'ios',
        iosTaskHint: 'dictation',
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: RecognizerIntentExtraLanguageModel.LANGUAGE_MODEL_FREE_FORM,
          EXTRA_MASK_OFFENSIVE_WORDS: false,
        },
        recordingOptions: {
          persist: true,
          outputSampleRate: 16000,
          outputEncoding: 'pcmFormatInt16',
        },
      });
      recordingStartedAtRef.current = Date.now();
      setRecordingState('recording');
      return true;
    } catch {
      clearSessionRefs();
      setRecordingState('idle');
      setError('Unable to start recording. Please try again.');
      return false;
    }
  }, [clearSessionRefs]);

  const stopRecording = useCallback(async (): Promise<RecordingOutput | null> => {
    if (recordingState !== 'recording') {
      setRecordingState('idle');
      setError('No active recording to stop.');
      return null;
    }

    setRecordingState('processing');

    try {
      // Wait for recognition to stop and end event to fire
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          pendingStopRef.current = { resolve, reject };
          ExpoSpeechRecognitionModule.stop();
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Voice capture timed out while finalizing.'));
          }, STOP_TIMEOUT_MS);
        }),
      ]);

      // Now wait for the final transcript to be delivered (with timeout)
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          // If we already have a final transcript, resolve immediately
          if (finalTranscriptRef.current.trim().length > 0 || transcriptRef.current.trim().length > 0) {
            resolve();
            return;
          }
          // Otherwise wait for the next final result event
          transcriptWaiterRef.current = { resolve, reject };
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            // Timeout is ok - we'll use what we've captured so far
            reject(null);
          }, TRANSCRIPT_WAIT_TIMEOUT_MS);
        }),
      ]).catch((err) => {
        // Suppress timeout error when waiting for transcript - we'll just use what we have
        if (err === null) {
          return;
        }
        throw err;
      });

      const uri = audioUriRef.current;
      if (!uri) {
        setRecordingState('idle');
        setError('Recording finished but no audio file was created.');
        clearSessionRefs();
        return null;
      }

      const transcript = finalTranscriptRef.current.trim() || transcriptRef.current.trim();
      const durationMs = recordingStartedAtRef.current
        ? Math.max(0, Date.now() - recordingStartedAtRef.current)
        : 0;

      clearSessionRefs();
      return {
        uri,
        durationMs,
        transcript,
      };
    } catch (caught) {
      setRecordingState('idle');
      clearSessionRefs();
      setError(caught instanceof Error ? caught.message : 'Unable to stop recording. Please try again.');
      return null;
    }
  }, [clearSessionRefs, recordingState]);

  const resetProcessing = useCallback(() => {
    setRecordingState('idle');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    recordingState,
    error,
    startRecording,
    stopRecording,
    resetProcessing,
    clearError,
  };
}
