import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { ErrorBanner } from '../../components/ErrorBanner';
import { getDailyReview } from '../../lib/sdk';

export default function ReviewScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');

  const {
    data: review,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['review', 'daily'],
    queryFn: () => getDailyReview(),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
      </SafeAreaView>
    );
  }

  if (isError) {
    const message = (error instanceof Error && error.message) || 'Unable to load review';
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <ErrorBanner message={message} onRetry={() => { void refetch(); }} />
      </SafeAreaView>
    );
  }

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const isEmpty =
    !review ||
    (review.pendingCaptures === 0 &&
      review.actionsDueToday === 0 &&
      review.unacknowledgedReminders === 0 &&
      review.completedActions.length === 0 &&
      (review.suggestedNextActions?.length ?? 0) === 0);

  const allClear = review && review.actionsDueToday === 0 && review.unacknowledgedReminders === 0;
  const carryForwardActions = review?.suggestedNextActions ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Page header */}
        <View>
          <Text style={[styles.pageTitle, { color: palette.text.primary }]}>Review</Text>
          <Text style={[styles.pageSubtitle, { color: palette.text.secondary }]}>{todayLabel}</Text>
        </View>

        {/* Daily / Weekly toggle */}
        <View
          style={[
            styles.periodSwitcher,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Pressable
            style={[
              styles.periodSegment,
              {
                backgroundColor:
                  period === 'daily' ? palette.accent.brand : palette.background.card,
              },
            ]}
            onPress={() => setPeriod('daily')}
          >
            <Text
              style={[
                styles.periodSegmentText,
                {
                  color:
                    period === 'daily' ? palette.background.primary : palette.text.secondary,
                },
              ]}
            >
              Daily
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.periodSegment,
              {
                backgroundColor:
                  period === 'weekly' ? palette.accent.brand : palette.background.card,
              },
            ]}
            onPress={() => setPeriod('weekly')}
          >
            <Text
              style={[
                styles.periodSegmentText,
                {
                  color:
                    period === 'weekly' ? palette.background.primary : palette.text.secondary,
                },
              ]}
            >
              Weekly
            </Text>
          </Pressable>
        </View>

        {/* Empty state */}
        {isEmpty ? (
          <View
            style={[
              styles.card,
              styles.emptyCard,
              {
                backgroundColor: palette.background.card,
                borderColor: palette.border.default,
              },
            ]}
          >
            <Text style={[styles.emptyText, { color: palette.text.muted }]}>
              No review yet today.
            </Text>
            <Pressable style={[styles.outlineButton, { borderColor: palette.accent.brand }]}>
              <Text style={[styles.outlineButtonText, { color: palette.accent.brand }]}>
                Start a 2-minute review
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Metrics grid card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Overview</Text>
              <View style={styles.reviewMetricsGrid}>
                <View style={styles.reviewMetric}>
                  <Text style={[styles.reviewValue, { color: palette.text.primary }]}>
                    {review?.pendingCaptures ?? 0}
                  </Text>
                  <Text style={[styles.reviewLabel, { color: palette.text.secondary }]}>
                    Pending
                  </Text>
                </View>
                <View style={styles.reviewMetric}>
                  <Text style={[styles.reviewValue, { color: palette.text.primary }]}>
                    {review?.actionsDueToday ?? 0}
                  </Text>
                  <Text style={[styles.reviewLabel, { color: palette.text.secondary }]}>
                    Due today
                  </Text>
                </View>
                <View style={styles.reviewMetric}>
                  <Text style={[styles.reviewValue, { color: palette.text.primary }]}>
                    {review?.unacknowledgedReminders ?? 0}
                  </Text>
                  <Text style={[styles.reviewLabel, { color: palette.text.secondary }]}>
                    Awaiting ack
                  </Text>
                </View>
                <View style={styles.reviewMetric}>
                  <Text style={[styles.reviewValue, { color: palette.text.primary }]}>
                    {review?.completedActions.length ?? 0}
                  </Text>
                  <Text style={[styles.reviewLabel, { color: palette.text.secondary }]}>
                    Completed
                  </Text>
                </View>
              </View>
            </View>

            {/* Completed card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>
                Completed today
              </Text>
              {!review || review.completedActions.length === 0 ? (
                <Text style={[styles.cardBody, { color: palette.text.muted }]}>
                  Nothing completed yet
                </Text>
              ) : (
                review.completedActions.map((action, index) => (
                  <View key={index} style={styles.completedRow}>
                    <Ionicons name="checkmark" size={16} color={palette.accent.success} />
                    <Text style={[styles.cardBody, { color: palette.text.primary }]}>{action}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Still open card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Still open</Text>
              {allClear ? (
                <Text style={[styles.cardBody, { color: palette.text.muted }]}>All clear</Text>
              ) : (
                <>
                  <View style={styles.openRow}>
                    <Text style={[styles.openValue, { color: palette.text.primary }]}>
                      {review?.actionsDueToday ?? 0}
                    </Text>
                    <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                      Due today
                    </Text>
                  </View>
                  <View style={styles.openRow}>
                    <Text style={[styles.openValue, { color: palette.text.primary }]}>
                      {review?.unacknowledgedReminders ?? 0}
                    </Text>
                    <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                      Awaiting ack
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Carry-forward card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Carry forward</Text>
              {carryForwardActions.length === 0 ? (
                <Text style={[styles.cardBody, { color: palette.text.muted }]}>Nothing to carry forward yet</Text>
              ) : (
                carryForwardActions.map((action, index) => (
                  <View key={index} style={styles.carryForwardRow}>
                    <Ionicons name="arrow-forward" size={16} color={palette.accent.brand} />
                    <Text style={[styles.cardBody, { color: palette.text.primary }]}>{action}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* What should matter tomorrow prompt card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.promptText, { color: palette.accent.brand }]}>
            What should matter tomorrow?
          </Text>
          <TextInput
            style={[
              styles.promptInput,
              {
                color: palette.text.primary,
                borderColor: palette.border.default,
                backgroundColor: palette.background.secondary,
              },
            ]}
            placeholder="Add a note for tomorrow…"
            placeholderTextColor={palette.text.muted}
            multiline
          />
        </View>
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
  placeholderCard: {
    height: 80,
    borderRadius: spacing[3],
    marginBottom: spacing[3],
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    marginTop: spacing[1],
  },
  periodSwitcher: {
    borderWidth: 1,
    borderRadius: 999,
    padding: spacing[1],
    flexDirection: 'row',
  },
  periodSegment: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
  },
  periodSegmentText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  emptyCard: {
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    textAlign: 'center',
  },
  outlineButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    alignSelf: 'center',
    marginTop: spacing[2],
  },
  outlineButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  reviewMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  reviewMetric: {
    flex: 1,
    minWidth: '40%',
    alignItems: 'center',
  },
  reviewValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  reviewLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  carryForwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
  },
  openValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  promptText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  promptInput: {
    borderWidth: 1,
    borderRadius: spacing[2],
    padding: spacing[3],
    fontSize: typography.fontSize.sm,
    minHeight: spacing[12],
    textAlignVertical: 'top',
  },
});
