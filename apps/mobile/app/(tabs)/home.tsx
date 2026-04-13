import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { GoalSummary, InboxItem } from '@lifeos/contracts';
import { useRouter } from 'expo-router';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { ErrorBanner } from '../../components/ErrorBanner';
import { HouseholdHomeView } from '../../components/HouseholdHomeView';
import { sdk, getDailyReview } from '../../lib/sdk';
import { useSessionStore } from '../../lib/session';

type ReminderItemData = {
  actionId?: string;
  dueDate?: string;
};

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function formatDueDate(dueDate?: string): string {
  if (!dueDate) {
    return 'No due date';
  }

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'No due date';
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function reminderDueDate(item: InboxItem): string | undefined {
  if (item.type !== 'reminder') {
    return undefined;
  }

  const value = (item.data as ReminderItemData).dueDate;
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function reminderActionId(item: InboxItem): string | undefined {
  if (item.type !== 'reminder') {
    return undefined;
  }

  const actionId = (item.data as ReminderItemData).actionId;
  return typeof actionId === 'string' && actionId.length > 0 ? actionId : undefined;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const displayName = useSessionStore((state) => state.user?.displayName);
  const householdId = useSessionStore((state) => state.householdId);
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [activeContext, setActiveContext] = useState<'personal' | 'household'>(() =>
    householdId ? 'household' : 'personal',
  );
  const [pendingHouseholdEntry, setPendingHouseholdEntry] = useState(false);

  const {
    data: inbox,
    isLoading: isInboxLoading,
    isError: isInboxError,
    error: inboxError,
    refetch: refetchInbox,
  } = useQuery({
    queryKey: ['inbox'],
    queryFn: () => sdk.inbox.list(),
  });

  const {
    data: goals,
    isLoading: isGoalsLoading,
    isError: isGoalsError,
    error: goalsError,
    refetch: refetchGoals,
  } = useQuery({
    queryKey: ['goals'],
    queryFn: () => sdk.timeline.goals(),
  });

  const {
    data: review,
    isLoading: isReviewLoading,
    isError: isReviewError,
    error: reviewError,
    refetch: refetchReview,
  } = useQuery({
    queryKey: ['review', 'daily'],
    queryFn: () => getDailyReview(),
  });

  const openTasks = useMemo(
    () =>
      (inbox ?? [])
        .filter((item) => item.type === 'reminder')
        .map((item) => ({
          id: reminderActionId(item) ?? item.id,
          title: item.title,
          dueDate: reminderDueDate(item),
        }))
        .sort((a, b) => {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return aDue - bDue;
        })
        .slice(0, 3),
    [inbox],
  );

  const unreadApprovalCount = useMemo(
    () => (inbox ?? []).filter((item) => item.type === 'approval' && !item.read).length,
    [inbox],
  );

  useEffect(() => {
    if (unreadApprovalCount <= 0) {
      pulseAnim.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
      pulseAnim.setValue(1);
    };
  }, [pulseAnim, unreadApprovalCount]);

  useEffect(() => {
    if (householdId && !pendingHouseholdEntry) {
      setActiveContext('household');
      return;
    }

    if (!householdId) {
      setActiveContext('personal');
    }
  }, [householdId, pendingHouseholdEntry]);

  useEffect(() => {
    if (pendingHouseholdEntry && householdId) {
      setActiveContext('household');
      setPendingHouseholdEntry(false);
    }
  }, [householdId, pendingHouseholdEntry]);

  const greeting = greetingForHour(new Date().getHours());

  if (isInboxLoading || isGoalsLoading || isReviewLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
      </SafeAreaView>
    );
  }

  if (isInboxError || isGoalsError || isReviewError) {
    const message =
      (inboxError instanceof Error && inboxError.message) ||
      (goalsError instanceof Error && goalsError.message) ||
      (reviewError instanceof Error && reviewError.message) ||
      'Unable to load dashboard';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <ErrorBanner
          message={message}
          onRetry={() => {
            void refetchInbox();
            void refetchGoals();
            void refetchReview();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.contextSwitcher,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Pressable
            style={[
              styles.contextSegment,
              {
                backgroundColor:
                  activeContext === 'personal' ? palette.accent.brand : palette.background.card,
              },
            ]}
            onPress={() => {
              setActiveContext('personal');
              setPendingHouseholdEntry(false);
            }}
          >
            <Text
              style={[
                styles.contextSegmentText,
                {
                  color:
                    activeContext === 'personal'
                      ? palette.background.primary
                      : palette.text.secondary,
                },
              ]}
            >
              Personal
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.contextSegment,
              {
                backgroundColor:
                  activeContext === 'household' ? palette.accent.brand : palette.background.card,
              },
            ]}
            onPress={() => {
              if (!householdId) {
                setPendingHouseholdEntry(true);
                router.push('/modal/household-onboarding');
                return;
              }
              setActiveContext('household');
            }}
          >
            <Text
              style={[
                styles.contextSegmentText,
                {
                  color:
                    activeContext === 'household'
                      ? palette.background.primary
                      : palette.text.secondary,
                },
              ]}
            >
              🏠 Household
            </Text>
          </Pressable>
        </View>

        {activeContext === 'personal' ? (
          <>
            <View>
              <Text style={[styles.greeting, { color: palette.text.secondary }]}>{greeting}</Text>
              <Text style={[styles.name, { color: palette.text.primary }]}>
                {displayName?.split(' ')[0] ?? 'there'}
              </Text>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Active goals</Text>
              {(goals ?? []).length === 0 ? (
                <Text style={[styles.cardBody, { color: palette.text.muted }]}>No active goals</Text>
              ) : (
                <>
                  {(goals ?? []).slice(0, 3).map((goal: GoalSummary) => {
                    const progress = (goal.completedTasks / Math.max(goal.totalTasks, 1)) * 100;

                    return (
                      <View key={goal.id} style={styles.inlineGoalRow}>
                        <Text
                          style={[styles.taskTitle, { color: palette.text.primary }]}
                          numberOfLines={1}
                        >
                          {goal.title}
                        </Text>
                        <View
                          style={[styles.progressTrack, { backgroundColor: palette.border.subtle }]}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                backgroundColor: palette.accent.brand,
                                width: `${progress}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                  {(goals ?? []).length > 3 ? (
                    <Text style={[styles.moreGoals, { color: palette.text.muted }]}>
                      +{(goals ?? []).length - 3} more
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
            >
          <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Open tasks</Text>
          {openTasks.length === 0 ? (
            <Text style={[styles.cardBody, { color: palette.text.muted }]}>
              No open tasks right now
            </Text>
          ) : (
            openTasks.map((task) => {
              const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

              return (
                <View
                  key={task.id}
                  style={[
                    styles.taskRow,
                    isOverdue
                      ? {
                          borderLeftWidth: 3,
                          borderLeftColor: palette.accent.danger,
                        }
                      : null,
                  ]}
                >
                  <Text
                    style={[styles.taskTitle, { color: palette.text.primary }]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                  <View
                    style={[
                      styles.dueBadge,
                      {
                        borderColor: palette.border.default,
                        backgroundColor: palette.background.secondary,
                      },
                    ]}
                  >
                    <Text style={[styles.dueBadgeText, { color: palette.text.secondary }]}>
                      {formatDueDate(task.dueDate)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
          </View>

            <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
            >
          <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Daily review</Text>
          {!review || (review.pendingCaptures === 0 &&
            review.actionsDueToday === 0 &&
            review.unacknowledgedReminders === 0 &&
            review.completedActions.length === 0) ? (
            <Text style={[styles.cardBody, { color: palette.text.muted }]}>
              Loop is clear — nothing to review
            </Text>
          ) : (
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
          )}
          </View>

            <Pressable
          onPress={() => router.push('/(tabs)/inbox')}
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
            >
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Inbox</Text>
            <Ionicons
              name="chevron-forward"
              size={typography.fontSize.base}
              color={palette.text.muted}
              style={styles.chevron}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text style={[styles.metricValue, { color: palette.text.primary }]}>
              {unreadApprovalCount}
            </Text>
            {unreadApprovalCount > 0 ? (
              <Animated.View
                style={[
                  styles.pulseDot,
                  {
                    backgroundColor: palette.accent.danger,
                    opacity: pulseAnim,
                  },
                ]}
              />
            ) : null}
          </View>
          {unreadApprovalCount > 0 ? (
            <Text style={[styles.cardBody, { color: palette.accent.warning }]}>
              Approvals waiting for your response
            </Text>
          ) : (
            <Text style={[styles.cardBody, { color: palette.text.muted }]}>
              No unread approvals
            </Text>
          )}
            </Pressable>
          </>
        ) : null}

        {activeContext === 'household' && householdId ? (
          <HouseholdHomeView householdId={householdId} />
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
  contextSwitcher: {
    borderWidth: 1,
    borderRadius: 999,
    padding: spacing[1],
    flexDirection: 'row',
  },
  contextSegment: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
  },
  contextSegmentText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  greeting: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  name: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing[1],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  cardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  cardBody: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  inlineGoalRow: {
    gap: spacing[2],
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  moreGoals: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
    paddingLeft: spacing[2],
  },
  taskTitle: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  dueBadge: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  dueBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  placeholderCard: {
    height: 80,
    borderRadius: spacing[3],
    marginBottom: spacing[3],
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chevron: {
    marginLeft: spacing[2],
  },
  reviewMetricsGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  reviewMetric: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
  },
  reviewValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  reviewLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing[1],
    textAlign: 'center',
  },
});
