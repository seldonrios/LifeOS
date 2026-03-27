import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { darkColors, lightColors, spacing, typography } from "@lifeos/ui";

type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.background.card,
          borderColor: palette.border.default,
          borderLeftColor: palette.accent.danger,
        },
      ]}
    >
      <Text style={[styles.message, { color: palette.accent.danger }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          style={[
            styles.retryButton,
            {
              borderColor: palette.accent.danger,
              backgroundColor: palette.background.primary,
            },
          ]}
          onPress={onRetry}
        >
          <Text style={[styles.retryText, { color: palette.accent.danger }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: spacing[2],
    padding: spacing[3],
    gap: spacing[2],
  },
  message: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  retryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
