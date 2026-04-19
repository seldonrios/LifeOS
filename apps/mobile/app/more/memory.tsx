import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { CaptureListItem } from '@lifeos/contracts';
import {
  ActivityIndicator,
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
import { sdk } from '../../lib/sdk';

function timeAgo(capturedAtIso: string): string {
  const capturedAt = Date.parse(capturedAtIso);
  if (Number.isNaN(capturedAt)) {
    return 'Unknown time';
  }

  const now = Date.now();
  const diff = Math.max(0, now - capturedAt);
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

export default function MemoryScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const { data, isLoading, isError, error, isRefetching, refetch } = useQuery({
    queryKey: ['memory', query],
    queryFn: () => sdk.capture.search(query),
  });

  const captures = useMemo(() => data ?? [], [data]);

  const renderItem = ({ item }: { item: CaptureListItem }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.background.card,
          borderColor: palette.border.default,
        },
      ]}
    >
      <Text style={[styles.contentText, { color: palette.text.primary }]}>{item.content}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: palette.text.muted }]}>{timeAgo(item.capturedAt)}</Text>
        <View
          style={[
            styles.statusTag,
            {
              backgroundColor: palette.background.secondary,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.statusText, { color: palette.text.secondary }]}>{item.status}</Text>
        </View>
      </View>
    </View>
  );

  if (isLoading && captures.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.accent.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : 'Unable to load captures';
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
        data={captures}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={captures.length === 0 ? styles.emptyContent : styles.listContent}
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
                value={searchInput}
                onChangeText={setSearchInput}
                onSubmitEditing={() => {
                  setQuery(searchInput.trim());
                }}
                placeholder="Search memory"
                placeholderTextColor={palette.text.muted}
                style={[styles.searchInput, { color: palette.text.primary }]}
                returnKeyType="search"
              />
              {searchInput.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setSearchInput('');
                    setQuery('');
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
            <Text style={[styles.emptyText, { color: palette.text.secondary }]}>No captures found</Text>
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
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing[3],
  },
  contentText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  metaText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: spacing[4],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
});