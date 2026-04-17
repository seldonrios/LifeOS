import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

interface MobileCoachmarkProps {
  text: string;
  step: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

export function MobileCoachmark({
  text,
  step,
  totalSteps,
  onNext,
  onSkip,
}: MobileCoachmarkProps): JSX.Element {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const backdropColor = colorScheme === 'dark' ? 'rgba(2, 6, 23, 0.34)' : 'rgba(15, 23, 42, 0.08)';

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropColor }]} />
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.background.card,
            borderColor: palette.border.default,
          },
        ]}
      >
        <Text style={[styles.stepLabel, { color: palette.text.secondary }]}>
          Step {step} of {totalSteps}
        </Text>
        <Text style={[styles.body, { color: palette.text.primary }]}>{text}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onNext}
            style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
          >
            <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Got it →</Text>
          </Pressable>
          <Pressable onPress={onSkip} hitSlop={8}>
            <Text style={[styles.skipText, { color: palette.text.secondary }]}>Skip tour</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[8],
    borderWidth: 1,
    borderRadius: spacing[4],
    padding: spacing[4],
    gap: spacing[3],
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  stepLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  body: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.base,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  skipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});