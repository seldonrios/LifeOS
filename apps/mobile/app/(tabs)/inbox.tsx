import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { InboxItem } from '@lifeos/contracts';
import { useRouter } from 'expo-router';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { ErrorBanner } from '../../components/ErrorBanner';
import { queryClient } from '../../lib/query-client';
import { sdk } from '../../lib/sdk';

function timeAgo(createdAt: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - createdAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return 'Just now';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}m ago`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}h ago`;
  }
  if (diff < 2 * day) {
    return 'Yesterday';
  }
  return `${Math.floor(diff / day)}d ago`;
}

function markReadOptimistically(itemId: string) {
  queryClient.setQueryData<InboxItem[]>(['inbox'], (old) =>
    (old ?? []).map((item) => (item.id === itemId ? { ...item, read: true } : item)),
  );
}

function ReadIndicator({
  read,
  palette,
}: {
  read: boolean;
  palette: typeof darkColors | typeof lightColors;
}) {
  return (
    <View
      style={[
        styles.readIndicator,
        {
          borderColor: read ? palette.border.default : palette.accent.brand,
          backgroundColor: read ? palette.background.secondary : palette.accent.brand,
        },
      ]}
    >
      {!read ? (
        <View style={[styles.unreadDot, { backgroundColor: palette.background.primary }]} />
      ) : null}
      <Text
        style={[
          styles.readIndicatorText,
          { color: read ? palette.text.secondary : palette.background.primary },
        ]}
      >
        {read ? 'Read' : 'Unread'}
      </Text>
    </View>
  );
}

export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, error, isRefetching, refetch } = useQuery({
    queryKey: ['inbox'],
    queryFn: () => sdk.inbox.list(),
  });

  const items = useMemo(() => data ?? [], [data]);
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return items;
    }

    return items.filter((item) => {
      const titleMatch = item.title.toLowerCase().includes(term);
      const descriptionMatch = item.description?.toLowerCase().includes(term) ?? false;
      const typeMatch = item.type.toLowerCase().includes(term);
      return titleMatch || descriptionMatch || typeMatch;
    });
  }, [items, searchTerm]);

  const handleNotificationPress = (item: InboxItem) => {
    markReadOptimistically(item.id);
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    if (item.type === 'approval') {
      return (
        <Pressable
          style={[
            styles.card,
            styles.approvalCard,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
              borderLeftColor: palette.accent.brand,
            },
          ]}
          onPress={() => {
            markReadOptimistically(item.id);
            router.push({ pathname: '/modal/approval-detail', params: { itemId: item.id } });
          }}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.itemTitle, { color: palette.text.primary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <ReadIndicator read={item.read} palette={palette} />
          </View>
          {item.description ? (
            <Text
              style={[styles.itemDescription, { color: palette.text.secondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}
          <Text style={[styles.metaText, { color: palette.text.muted }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </Pressable>
      );
    }

    if (item.type === 'notification') {
      return (
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
          onPress={() => {
            handleNotificationPress(item);
          }}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.itemTitle, { color: palette.text.primary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <ReadIndicator read={item.read} palette={palette} />
          </View>
          {item.description ? (
            <Text
              style={[styles.itemDescription, { color: palette.text.secondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}
          <Text style={[styles.metaText, { color: palette.text.muted }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        style={[
          styles.card,
          styles.reminderCard,
          {
            backgroundColor: palette.background.card,
            borderColor: palette.border.default,
          },
        ]}
        onPress={() => {
          // Navigation for reminders is deferred to a later sprint.
        }}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.itemTitle, { color: palette.text.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <ReadIndicator read={item.read} palette={palette} />
        </View>
        {item.description ? (
          <Text
            style={[styles.itemDescription, { color: palette.text.secondary }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        ) : null}
        <Text style={[styles.metaText, { color: palette.text.muted }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </Pressable>
    );
  };

  if (isError) {
    const message = error instanceof Error ? error.message : 'Unable to load inbox';
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filteredItems.length === 0 ? styles.emptyContent : styles.listContent
        }
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={palette.accent.brand}
          />
        }
        ListHeaderComponent={
          <View style={[styles.searchHeader, { backgroundColor: palette.background.primary }]}>
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: palette.background.card,
                  borderColor: palette.border.default,
                },
              ]}
            >
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Search inbox"
                placeholderTextColor={palette.text.muted}
                style={[styles.searchInput, { color: palette.text.primary }]}
              />
              {searchTerm.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setSearchTerm('');
                  }}
                  hitSlop={8}
                  style={styles.clearSearchButton}
                >
                  <Ionicons name="close-circle" size={18} color={palette.text.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: palette.text.secondary }]}>
              {searchTerm.trim().length > 0
                ? `No results for '${searchTerm.trim()}'`
                : 'Your inbox is clear'}
            </Text>
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
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  searchHeader: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  searchBar: {
    minHeight: 42,
    borderRadius: spacing[3],
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  clearSearchButton: {
    marginLeft: spacing[2],
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
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
  approvalCard: {
    borderLeftWidth: 3,
  },
  reminderCard: {
    borderStyle: 'dashed',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  itemTitle: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  itemDescription: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  readIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: spacing[4],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    gap: spacing[1],
  },
  unreadDot: {
    width: spacing[1],
    height: spacing[1],
    borderRadius: spacing[1],
  },
  readIndicatorText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
