import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InboxItem } from "@lifeos/contracts";
import {
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

  const {
    data: timeline,
    isLoading: isTimelineLoading,
    isError: isTimelineError,
    error: timelineError,
    refetch: refetchTimeline,
  } = useQuery({
    queryKey: ["timeline"],
    queryFn: () => sdk.timeline.list(),
  });

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

  const activeGoalCount = useMemo(
    () =>
      new Set(
        (timeline ?? [])
          .filter((entry) => entry.type === "task" && entry.status !== "done" && entry.goalId)
          .map((entry) => entry.goalId)
      ).size,
    [timeline]
  );

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

  const greeting = greetingForHour(new Date().getHours());

  if (isTimelineLoading || isInboxLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
        <View style={[styles.placeholderCard, { backgroundColor: palette.background.card }]} />
      </SafeAreaView>
    );
  }

  if (isTimelineError || isInboxError) {
    const message =
      (timelineError instanceof Error && timelineError.message) ||
      (inboxError instanceof Error && inboxError.message) ||
      "Unable to load dashboard";

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <ErrorBanner
          message={message}
          onRetry={() => {
            void refetchTimeline();
            void refetchInbox();
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
          <Text style={[styles.name, { color: palette.text.primary }]}>{displayName ?? "there"}</Text>
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
          <Text style={[styles.metricValue, { color: palette.text.primary }]}>{activeGoalCount}</Text>
          <Text style={[styles.cardBody, { color: palette.text.muted }]}>Goals with active tasks</Text>
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
            openTasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
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
            ))
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
          <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Inbox</Text>
          <Text style={[styles.metricValue, { color: palette.text.primary }]}>{unreadApprovalCount}</Text>
          {unreadApprovalCount > 0 ? (
            <Text style={[styles.cardBody, { color: palette.accent.warning }]}>Approvals waiting for your response</Text>
          ) : (
            <Text style={[styles.cardBody, { color: palette.text.muted }]}>No unread approvals</Text>
          )}
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
  metricValue: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
  },
  cardBody: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  taskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing[2],
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
});
