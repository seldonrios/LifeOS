import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import type { CaptureResult } from '@lifeos/contracts';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { useQueueStore } from '../../lib/queue';
import { sdk } from '../../lib/sdk';
import { useVoiceRecorder } from '../../lib/voice-recorder';

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function CaptureScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const pulseAnimation = useRef(new Animated.Value(0)).current;
  const recordingStartedAtRef = useRef<number | null>(null);
  const {
    recordingState,
    error: voiceError,
    startRecording,
    stopRecording,
    resetProcessing,
    clearError,
  } = useVoiceRecorder();
  const pendingCaptures = useQueueStore((state) =>
    state.items.filter((item) => item.type === 'capture' && item.status === 'pending'),
  ).slice(0, 3);

  useEffect(() => {
    if (recordingState !== 'recording') {
      return;
    }

    if (recordingStartedAtRef.current === null) {
      recordingStartedAtRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (recordingStartedAtRef.current === null) {
        return;
      }

      setVoiceElapsedMs(Date.now() - recordingStartedAtRef.current);
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [recordingState]);

  useEffect(() => {
    if (recordingState !== 'recording') {
      pulseAnimation.stopAnimation();
      pulseAnimation.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();

    return () => {
      pulse.stop();
      pulseAnimation.stopAnimation();
      pulseAnimation.setValue(0);
    };
  }, [pulseAnimation, recordingState]);

  const trimmedContent = content.trim();
  const isSendDisabled = trimmedContent.length === 0 || isLoading;
  const isCaptureSuccess = captureResult !== null && captureResult.status === 'success';

  const handleContentChange = (value: string) => {
    setContent(value);
    if (captureResult !== null) {
      setCaptureResult(null);
    }
  };

  async function handleSend() {
    if (trimmedContent.length === 0) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await sdk.capture.create({ type: 'text', content: trimmedContent });
      setContent('');
      setOfflineBanner(false);
      setCaptureResult(result);
    } catch {
      useQueueStore.getState().enqueue({
        type: 'capture',
        payload: { type: 'text', content: trimmedContent },
        conflictPolicy: 'last-write-wins',
      });
      setOfflineBanner(true);
      setContent('');
      setCaptureResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartVoiceRecording() {
    clearError();
    setCaptureResult(null);
    setOfflineBanner(false);
    setVoiceElapsedMs(0);
    recordingStartedAtRef.current = null;

    const started = await startRecording();
    if (started) {
      recordingStartedAtRef.current = Date.now();
    }
  }

  async function handleStopVoiceRecording() {
    const recording = await stopRecording();
    recordingStartedAtRef.current = null;

    if (!recording) {
      return;
    }

    setVoiceElapsedMs(recording.durationMs);

    let audioBase64 = '';

    try {
      audioBase64 = await FileSystem.readAsStringAsync(recording.uri, {
        encoding: 'base64',
      });

      const result = await sdk.capture.create({
        type: 'voice',
        content: '',
        metadata: {
          audioBase64,
          durationMs: recording.durationMs,
        },
      });

      setOfflineBanner(false);
      setCaptureResult(result);
    } catch {
      useQueueStore.getState().enqueue({
        type: 'capture',
        payload: {
          type: 'voice',
          content: '',
          metadata: {
            audioBase64,
            durationMs: recording.durationMs,
          },
        },
        conflictPolicy: 'last-write-wins',
      });
      setOfflineBanner(true);
      setCaptureResult(null);
    } finally {
      resetProcessing();
      setVoiceElapsedMs(0);
    }
  }

  const pulseScale = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.45],
  });

  const pulseOpacity = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  const formattedVoiceDuration = formatDuration(voiceElapsedMs);
  const isVoiceProcessing = recordingState === 'processing';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.name, { color: palette.text.primary }]}>Capture</Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[
              styles.modeButton,
              {
                backgroundColor:
                  mode === 'text' ? palette.accent.brand : palette.background.secondary,
              },
            ]}
            onPress={() => {
              setMode('text');
            }}
          >
            <Text
              style={[
                styles.modeButtonText,
                {
                  color: mode === 'text' ? palette.background.primary : palette.text.primary,
                },
              ]}
            >
              Text
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeButton,
              {
                backgroundColor:
                  mode === 'voice' ? palette.accent.brand : palette.background.secondary,
              },
            ]}
            onPress={() => {
              setMode('voice');
            }}
          >
            <Text
              style={[
                styles.modeButtonText,
                {
                  color: mode === 'voice' ? palette.background.primary : palette.text.primary,
                },
              ]}
            >
              🎤 Voice
            </Text>
          </Pressable>
        </View>

        {mode === 'text' ? (
          <View style={styles.section}>
            <TextInput
              multiline
              maxLength={4000}
              value={content}
              onChangeText={handleContentChange}
              placeholder="Capture a thought, task, or note"
              placeholderTextColor={palette.text.muted}
              style={[
                styles.input,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                  color: palette.text.primary,
                },
              ]}
              textAlignVertical="top"
            />
            {content.length >= 3800 ? (
              <Text style={[styles.counterText, { color: palette.accent.warning }]}>
                {content.length} / 4000
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.voiceSection}>
            {isVoiceProcessing ? (
              <View style={styles.voiceProcessingState}>
                <ActivityIndicator color={palette.accent.brand} />
                <Text style={[styles.voiceProcessingText, { color: palette.text.secondary }]}>
                  Processing voice capture...
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.voiceButtonWrap}>
                  {recordingState === 'recording' ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.voicePulseRing,
                        {
                          borderColor: palette.accent.danger,
                          opacity: pulseOpacity,
                          transform: [{ scale: pulseScale }],
                        },
                      ]}
                    />
                  ) : null}
                  <Pressable
                    style={[
                      styles.voiceButton,
                      {
                        backgroundColor:
                          recordingState === 'recording'
                            ? palette.accent.danger
                            : palette.accent.brand,
                      },
                    ]}
                    onPress={() => {
                      if (recordingState === 'recording') {
                        void handleStopVoiceRecording();
                        return;
                      }

                      void handleStartVoiceRecording();
                    }}
                  >
                    <Text style={[styles.voiceButtonIcon, { color: palette.background.primary }]}>
                      {recordingState === 'recording' ? '■' : '🎤'}
                    </Text>
                  </Pressable>
                </View>
                {recordingState === 'recording' ? (
                  <Text style={[styles.voiceDurationText, { color: palette.text.secondary }]}>
                    {formattedVoiceDuration}
                  </Text>
                ) : null}
              </>
            )}
            {voiceError ? (
              <Text style={[styles.voiceErrorText, { color: palette.accent.danger }]}>
                {voiceError}
              </Text>
            ) : null}
          </View>
        )}

        {isCaptureSuccess ? (
          <View style={styles.successRow}>
            <Text style={[styles.successText, { color: palette.accent.success }]}>Captured ✓</Text>
            <Pressable
              style={[
                styles.shareButton,
                {
                  borderColor: palette.border.default,
                  backgroundColor: palette.background.card,
                },
              ]}
              onPress={() => {
                if (!captureResult) {
                  return;
                }

                void Share.share({
                  message: captureResult.content || 'LifeOS capture',
                  title: 'LifeOS',
                });
              }}
            >
              <Text style={[styles.shareButtonText, { color: palette.text.secondary }]}>Share</Text>
            </Pressable>
          </View>
        ) : null}

        {mode === 'text' ? (
          <Pressable
            style={[
              styles.sendButton,
              {
                backgroundColor: isSendDisabled
                  ? palette.background.secondary
                  : palette.accent.brand,
              },
            ]}
            disabled={isSendDisabled}
            onPress={() => {
              void handleSend();
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={palette.background.primary} />
            ) : (
              <Text style={[styles.sendButtonText, { color: palette.background.primary }]}>
                Send
              </Text>
            )}
          </Pressable>
        ) : null}

        {offlineBanner ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: palette.background.secondary,
                borderColor: palette.accent.warning,
              },
            ]}
          >
            <Text style={[styles.bannerText, { color: palette.text.primary }]}>
              Saved offline — will sync when connected
            </Text>
          </View>
        ) : null}

        {pendingCaptures.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>
              QUEUED FOR SYNC
            </Text>
            {pendingCaptures.map((item) => {
              const captureText =
                typeof item.payload.content === 'string' ? item.payload.content.trim() : '';
              const preview = captureText.length > 0 ? captureText : 'Pending capture';

              return (
                <View
                  key={item.id}
                  style={[
                    styles.queueCard,
                    {
                      backgroundColor: palette.background.card,
                      borderColor: palette.border.default,
                    },
                  ]}
                >
                  <Text
                    style={[styles.queueCardText, { color: palette.text.primary }]}
                    numberOfLines={1}
                  >
                    {preview}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  scrollContent: {
    gap: spacing[3],
    paddingBottom: spacing[8],
  },
  name: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  modeButton: {
    flex: 1,
    borderRadius: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  section: {
    gap: spacing[2],
  },
  input: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    fontSize: typography.fontSize.base,
  },
  counterText: {
    alignSelf: 'flex-end',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  voiceSection: {
    alignItems: 'center',
    gap: spacing[2],
  },
  voiceProcessingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 120,
  },
  voiceProcessingText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  voiceButtonWrap: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  voicePulseRing: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
  },
  voiceButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonIcon: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  voiceDurationText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  voiceErrorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
  successText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  shareButton: {
    borderWidth: 1,
    borderRadius: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  shareButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  sendButton: {
    borderRadius: spacing[3],
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  sendButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  banner: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[3],
  },
  bannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  cardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  queueCard: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[3],
  },
  queueCardText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
});
