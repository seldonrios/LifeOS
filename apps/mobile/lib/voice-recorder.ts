import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

export type VoiceRecordingState = 'idle' | 'recording' | 'processing';

export type RecordingOutput = {
  uri: string;
  durationMs: number;
};

export function useVoiceRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recordingState, setRecordingState] = useState<VoiceRecordingState>('idle');
  const [error, setError] = useState<string | null>(null);

  const stopAndUnloadCurrent = useCallback(async () => {
    const current = recordingRef.current;
    recordingRef.current = null;

    if (!current) {
      return;
    }

    try {
      await current.stopAndUnloadAsync();
    } catch {
      // Ignore cleanup failures when recording has already stopped.
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setRecordingState('idle');
      setError('Microphone permission is required to record voice capture.');
      return false;
    }

    try {
      await stopAndUnloadCurrent();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setRecordingState('recording');
      return true;
    } catch {
      await stopAndUnloadCurrent();
      setRecordingState('idle');
      setError('Unable to start recording. Please try again.');
      return false;
    }
  }, [stopAndUnloadCurrent]);

  const stopRecording = useCallback(async (): Promise<RecordingOutput | null> => {
    const current = recordingRef.current;
    if (!current) {
      setRecordingState('idle');
      setError('No active recording to stop.');
      return null;
    }

    setRecordingState('processing');
    recordingRef.current = null;

    try {
      await current.stopAndUnloadAsync();
      const status = await current.getStatusAsync();
      const uri = current.getURI();

      if (!uri) {
        setRecordingState('idle');
        setError('Recording finished but no audio file was created.');
        return null;
      }

      const durationMs = "durationMillis" in status ? (status.durationMillis ?? 0) : 0;
      return { uri, durationMs };
    } catch {
      setRecordingState('idle');
      setError('Unable to stop recording. Please try again.');
      return null;
    }
  }, []);

  const resetProcessing = useCallback(() => {
    setRecordingState('idle');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      void stopAndUnloadCurrent();
    };
  }, [stopAndUnloadCurrent]);

  return {
    recordingState,
    error,
    startRecording,
    stopRecording,
    resetProcessing,
    clearError,
  };
}
