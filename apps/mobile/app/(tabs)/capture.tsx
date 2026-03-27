import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { darkColors, lightColors, spacing, typography } from "@lifeos/ui";

import { useQueueStore } from "../../lib/queue";
import { sdk } from "../../lib/sdk";

export default function CaptureScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [offlineBanner, setOfflineBanner] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const pendingCaptures = useQueueStore((state) =>
    state.items.filter((item) => item.type === "capture" && item.status === "pending")
  ).slice(0, 3);

  useEffect(() => {
    if (!showSuccess) {
      return;
    }

    const timer = setTimeout(() => {
      setShowSuccess(false);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [showSuccess]);

  const trimmedContent = content.trim();
  const isSendDisabled = trimmedContent.length === 0 || isLoading;

  async function handleSend() {
    if (trimmedContent.length === 0) {
      return;
    }

    setIsLoading(true);

    try {
      await sdk.capture.create({ type: "text", content: trimmedContent });
      setContent("");
      setOfflineBanner(false);
      setShowSuccess(true);
    } catch {
      useQueueStore.getState().enqueue({
        type: "capture",
        payload: { type: "text", content: trimmedContent },
        conflictPolicy: "last-write-wins",
      });
      setOfflineBanner(true);
      setContent("");
      setShowSuccess(false);
    } finally {
      setIsLoading(false);
    }
  }

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
                  mode === "text" ? palette.accent.brand : palette.background.secondary,
              },
            ]}
            onPress={() => {
              setMode("text");
            }}
          >
            <Text
              style={[
                styles.modeButtonText,
                {
                  color:
                    mode === "text" ? palette.background.primary : palette.text.primary,
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
                  mode === "voice" ? palette.accent.brand : palette.background.secondary,
              },
            ]}
            onPress={() => {
              setMode("voice");
            }}
          >
            <Text
              style={[
                styles.modeButtonText,
                {
                  color:
                    mode === "voice" ? palette.background.primary : palette.text.primary,
                },
              ]}
            >
              🎤 Voice
            </Text>
          </Pressable>
        </View>

        {mode === "text" ? (
          <View style={styles.section}>
            <TextInput
              multiline
              maxLength={4000}
              value={content}
              onChangeText={setContent}
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
            <Pressable
              style={[
                styles.voiceButton,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
              onPress={() => {
                Alert.alert("Voice capture coming soon", "Voice capture is planned for Sprint 4.");
              }}
            >
              <Text style={[styles.voiceButtonText, { color: palette.text.primary }]}>🎤 Voice</Text>
            </Pressable>
          </View>
        )}

        {showSuccess ? <Text style={[styles.successText, { color: palette.accent.success }]}>Captured ✓</Text> : null}

        <Pressable
          style={[
            styles.sendButton,
            {
              backgroundColor: isSendDisabled ? palette.background.secondary : palette.accent.brand,
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
            <Text style={[styles.sendButtonText, { color: palette.background.primary }]}>Send</Text>
          )}
        </Pressable>

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
            <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>QUEUED FOR SYNC</Text>
            {pendingCaptures.map((item) => {
              const preview = typeof item.payload.content === "string" ? item.payload.content : "Pending capture";

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
                  <Text style={[styles.queueCardText, { color: palette.text.primary }]} numberOfLines={1}>
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
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  modeButton: {
    flex: 1,
    borderRadius: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: "center",
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
    alignSelf: "flex-end",
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  voiceSection: {
    alignItems: "center",
  },
  voiceButton: {
    minWidth: 180,
    borderWidth: 1,
    borderRadius: spacing[4],
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  voiceButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  successText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  sendButton: {
    borderRadius: spacing[3],
    paddingVertical: spacing[3],
    alignItems: "center",
    justifyContent: "center",
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
    textTransform: "uppercase",
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
