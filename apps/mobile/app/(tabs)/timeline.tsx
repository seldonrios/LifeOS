import { useQuery } from "@tanstack/react-query";
import type { GoalSummary, TimelineEntry } from "@lifeos/contracts";
import {
  FlatList,
  RefreshControl,
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

function formatDueDate(dueDate?: string): string {
  if (!dueDate) {
    return "";
  }

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStartTime(start?: string): string {
  if (!start) {
    return "";
  }

  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) {
    return "No deadline";
  }

  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return "No deadline";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function TimelineScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;

  const {
    data,
    isLoading,
    isError,
    error,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["timeline"],
    queryFn: () => sdk.timeline.list(),
  });

  const { data: goals, isLoading: isGoalsLoading, isRefetching: isGoalsRefetching, refetch: refetchGoals } = useQuery({
    queryKey: ["goals"],
    queryFn: () => sdk.timeline.goals(),
  });

  const renderGoalsSection = () => {
    if (!isGoalsLoading && (!goals || goals.length === 0)) {
      return null;
    }

    return (
      <View style={styles.goalsSection}>
        <Text style={[styles.sectionLabel, { color: palette.text.secondary }]}>GOALS</Text>
        {isGoalsLoading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalsListContent}>
            {Array.from({ length: 3 }).map((_, index) => (
              <View
                key={`goal-skeleton-${index}`}
                style={[
                  styles.skeletonCard,
                  {
                    backgroundColor: palette.background.card,
                  },
                ]}
              />
            ))}
          </ScrollView>
        ) : (
          <FlatList
            horizontal
            data={goals}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: GoalSummary }) => {
              const progress = (item.completedTasks / Math.max(item.totalTasks, 1)) * 100;
              const isOverdue = item.deadline !== null && new Date(item.deadline) < new Date();

              return (
                <View
                  style={[
                    styles.goalCard,
                    {
                      backgroundColor: palette.background.card,
                      borderColor: palette.border.default,
                    },
                  ]}
                >
                  <Text style={[styles.goalTitle, { color: palette.text.primary }]} numberOfLines={2}>
                    {item.title}
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
                  <Text style={[styles.goalLabel, { color: palette.text.muted }]}>
                    {item.completedTasks} / {item.totalTasks} tasks
                  </Text>
                  <Text
                    style={[
                      styles.goalDeadline,
                      { color: isOverdue ? palette.accent.danger : palette.text.muted },
                    ]}
                  >
                    {formatDeadline(item.deadline)}
                  </Text>
                </View>
              );
            }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.goalsListContent}
          />
        )}
      </View>
    );
  };

  const renderEntry = ({ item }: { item: TimelineEntry }) => {
    const meta = item.type === "task" ? formatDueDate(item.dueDate) : formatStartTime(item.start);

    let badgeBackgroundColor = palette.background.secondary;
    let badgeTextColor = palette.text.muted;

    if (item.status === "in-progress") {
      badgeBackgroundColor = palette.accent.brand;
      badgeTextColor = palette.background.primary;
    } else if (item.status === "done") {
      badgeBackgroundColor = palette.accent.success;
      badgeTextColor = palette.background.primary;
    } else if (item.status === "confirmed") {
      badgeBackgroundColor = palette.accent.brand;
      badgeTextColor = palette.background.primary;
    } else if (item.status === "tentative") {
      badgeBackgroundColor = palette.accent.warning;
      badgeTextColor = palette.background.primary;
    }

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.background.card,
            borderColor: palette.border.default,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.entryTitle, { color: palette.text.primary }]} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.badge, { backgroundColor: badgeBackgroundColor }]}>
            <Text style={[styles.badgeText, { color: badgeTextColor }]}>{item.status}</Text>
          </View>
        </View>
        {meta ? <Text style={[styles.metaText, { color: palette.text.muted }]}>{meta}</Text> : null}
      </View>
    );
  };

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
    const message = error instanceof Error ? error.message : "Unable to load timeline";

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <ErrorBanner
          message={message}
          onRetry={() => {
            void refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  const items = data ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={
          items.length === 0 && !isGoalsLoading && (!goals || goals.length === 0)
            ? styles.emptyContent
            : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || isGoalsRefetching}
            onRefresh={() => {
              void refetch();
              void refetchGoals();
            }}
            tintColor={palette.accent.brand}
          />
        }
        ListHeaderComponent={renderGoalsSection()}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: palette.text.secondary }]}>No upcoming items</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  goalsSection: {
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  goalsListContent: {
    gap: spacing[3],
    paddingRight: spacing[4],
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing[4],
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  goalCard: {
    width: 148,
    minHeight: 108,
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[3],
    gap: spacing[2],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  entryTitle: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  goalTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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
  goalLabel: {
    fontSize: typography.fontSize.xs,
  },
  goalDeadline: {
    fontSize: typography.fontSize.xs,
  },
  badge: {
    borderRadius: spacing[4],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: "capitalize",
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  placeholderCard: {
    height: 80,
    borderRadius: spacing[3],
    marginBottom: spacing[3],
  },
  skeletonCard: {
    width: 148,
    height: 108,
    borderRadius: spacing[3],
  },
});
