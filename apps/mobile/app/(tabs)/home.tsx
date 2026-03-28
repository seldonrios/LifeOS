import { useEffect, useMemo, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type { GoalSummary, InboxItem } from "@lifeos/contracts";
import { useRouter } from "expo-router";
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { darkColors, lightColors, spacing, typography } from "@lifeos/ui";

import { ErrorBanner } from "../../components/ErrorBanner";
import { sdk } from "../../lib/sdk";
import { useSessionStore } from "../../lib/session";

function greetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function formatDueDate(dueDate?: string): string {
  if (!dueDate) {
    return "No due date";
  }

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return "No due date";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function reminderDueDate(item: InboxItem): string | undefined {
  if (item.type !== "reminder") {
    return undefined;
  }

  const value = (item.data as { dueDate?: unknown }).dueDate;
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  return undefined;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const displayName = useSessionStore((state) => state.user?.displayName);
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const {
    data: inbox,
    isLoading: isInboxLoading,
    isError: isInboxError,
    error: inboxError,
    refetch: refetchInbox,
  } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => sdk.inbox.list(),
  });

  const {
    data: goals,
    isLoading: isGoalsLoading,
    isError: isGoalsError,
    error: goalsError,
    refetch: refetchGoals,
  } = useQuery({
    queryKey: ["goals"],
    queryFn: () => sdk.timeline.goals(),
  });

  const openTasks = useMemo(
    () =>
      (inbox ?? [])
        .filter((item) => item.type === "reminder")
        .map((item) => ({
          id: item.id,
          title: item.title,
          dueDate: reminderDueDate(item),
        }))
        .sort((a, b) => {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return aDue - bDue;
        })
        .slice(0, 3),
    [inbox]
  );

  const unreadApprovalCount = useMemo(
    () =>
      (inbox ?? []).filter((item) => item.type === "approval" && !item.read).length,
    [inbox]
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
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      pulseAnim.setValue(1);
    };
  }, [pulseAnim, unreadApprovalCount]);

  const greeting = greetingForHour(new Date().getHours());

  if (isInboxLoading || isGoalsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
      </SafeAreaView>
    );
  }

  if (isInboxError || isGoalsError) {
    const message =
      (inboxError instanceof Error && inboxError.message) ||
      (goalsError instanceof Error && goalsError.message) ||
      "Unable to load dashboard";

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <ErrorBanner
          message={message}
          onRetry={() => {
            void refetchInbox();
            void refetchGoals();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View>
          <Text style={[styles.greeting, { color: palette.text.secondary }]}>{greeting}</Text>
          <Text style={[styles.name, { color: palette.text.primary }]}>{displayName?.split(" ")[0] ?? "there"}</Text>
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
                    <Text style={[styles.taskTitle, { color: palette.text.primary }]} numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: palette.border.subtle }]}>
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
                <Text style={[styles.moreGoals, { color: palette.text.muted }]}>+{(goals ?? []).length - 3} more</Text>
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
            <Text style={[styles.cardBody, { color: palette.text.muted }]}>No open tasks right now</Text>
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
                <Text style={[styles.taskTitle, { color: palette.text.primary }]} numberOfLines={1}>
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
                  <Text style={[styles.dueBadgeText, { color: palette.text.secondary }]}>{formatDueDate(task.dueDate)}</Text>
                </View>
              </View>
            );})
          )}
        </View>

        <Pressable onPress={() => router.push("/(tabs)/inbox")}
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
            <Ionicons name="chevron-forward" size={typography.fontSize.base} color={palette.text.muted} style={styles.chevron} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
            <Text style={[styles.metricValue, { color: palette.text.primary }]}>{unreadApprovalCount}</Text>
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
            <Text style={[styles.cardBody, { color: palette.accent.warning }]}>Approvals waiting for your response</Text>
          ) : (
            <Text style={[styles.cardBody, { color: palette.text.muted }]}>No unread approvals</Text>
          )}
        </Pressable>
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
  greeting: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  name: {
    fontSize: typography.fontSize["2xl"],
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
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricValue: {
    fontSize: typography.fontSize["2xl"],
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
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  moreGoals: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  taskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
});
