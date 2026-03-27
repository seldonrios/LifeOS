import { useQuery } from "@tanstack/react-query";
import type { TimelineEntry } from "@lifeos/contracts";
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
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
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={palette.accent.brand}
          />
        }
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  entryTitle: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
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
});
