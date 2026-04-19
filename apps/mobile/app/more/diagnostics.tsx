import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { ErrorBanner } from '../../components/ErrorBanner';
import { sdk } from '../../lib/sdk';

type HealthProbe = Awaited<ReturnType<typeof sdk.ux.healthCheck>>[number];

function statusColor(
  status: HealthProbe['status'],
  palette: typeof darkColors | typeof lightColors,
): string {
  if (status === 'pass') {
    return palette.accent.success;
  }
  if (status === 'warn') {
    return palette.accent.warning;
  }
  return palette.accent.danger;
}

export default function DiagnosticsScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ux', 'health'],
    queryFn: () => sdk.ux.healthCheck(),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={palette.accent.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : 'Unable to load diagnostics';
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.title, { color: palette.text.primary }]}>Diagnostics</Text>
          <Text style={[styles.description, { color: palette.text.secondary }]}>
            Check the current health of core mobile-connected services.
          </Text>
          <View style={styles.statusList}>
            {(data ?? []).map((probe) => (
              <View key={probe.key} style={styles.probeRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColor(probe.status, palette) },
                  ]}
                />
                <View style={styles.probeCopy}>
                  <Text style={[styles.probeTitle, { color: palette.text.primary }]}>
                    {probe.title}
                  </Text>
                  <Text style={[styles.probeDetail, { color: palette.text.secondary }]}>
                    {probe.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
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
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: spacing[8],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[3],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  description: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 20,
  },
  statusList: {
    gap: spacing[3],
  },
  probeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  statusDot: {
    width: spacing[3],
    height: spacing[3],
    borderRadius: spacing[2],
    marginTop: spacing[1],
  },
  probeCopy: {
    flex: 1,
    gap: spacing[1],
  },
  probeTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  probeDetail: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 20,
  },
});