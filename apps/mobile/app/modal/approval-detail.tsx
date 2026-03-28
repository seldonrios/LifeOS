import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ApprovalRequest, InboxItem } from '@lifeos/contracts';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { ErrorBanner } from '../../components/ErrorBanner';
import { queryClient } from '../../lib/query-client';
import { sdk } from '../../lib/sdk';

function formatDeadline(deadline: number): { label: string; urgent: boolean } {
  const diff = deadline - Date.now();

  if (diff <= 0) {
    return { label: 'Expired', urgent: true };
  }

  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const urgent = diff < 60 * 60_000;

  if (hours > 0) {
    return { label: `Expires in ${hours}h ${minutes}m`, urgent };
  }

  return { label: `Expires in ${minutes}m`, urgent };
}

function formatContextValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Unserializable value]';
    }
  }

  return String(value);
}

export default function ApprovalDetailModal() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const router = useRouter();
  const rawItemId = useLocalSearchParams<{ itemId: string | string[] }>().itemId;
  const itemId = Array.isArray(rawItemId) ? rawItemId[0] : (rawItemId ?? '');

  const item = queryClient
    .getQueryData<InboxItem[]>(['inbox'])
    ?.find((entry) => entry.id === itemId);
  const approvalData = item?.data as ApprovalRequest | undefined;

  const isValidApproval =
    item !== undefined &&
    item.type === 'approval' &&
    typeof approvalData?.requestId === 'string' &&
    approvalData.requestId.length > 0 &&
    typeof approvalData?.action === 'string' &&
    approvalData.action.length > 0 &&
    approvalData?.context !== null &&
    typeof approvalData?.context === 'object';

  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = useCallback(async () => {
    if (!approvalData?.requestId) {
      setError('Approval request not found');
      return;
    }

    setLoading('approve');
    setError(null);

    try {
      await sdk.inbox.approve(approvalData.requestId);
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
      router.back();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to approve request';
      setError(message);
      setLoading(null);
    }
  }, [approvalData?.requestId, router]);

  const handleReject = useCallback(async () => {
    if (!approvalData?.requestId) {
      setError('Approval request not found');
      return;
    }

    setLoading('reject');
    setError(null);

    try {
      await sdk.inbox.reject(approvalData.requestId, reason.trim() || undefined);
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
      router.back();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to reject request';
      setError(message);
      setLoading(null);
    }
  }, [approvalData?.requestId, reason, router]);

  if (!isValidApproval || !approvalData) {
    const fallbackMessage = !item
      ? 'Approval item not found'
      : item.type !== 'approval'
        ? 'This item is not an approval request'
        : 'Approval request is missing required fields';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
        <View style={styles.content}>
          <ErrorBanner message={fallbackMessage} />
        </View>
      </SafeAreaView>
    );
  }

  const deadlineInfo =
    typeof approvalData.deadline === 'number' ? formatDeadline(approvalData.deadline) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: palette.text.primary }]}>{item.title}</Text>

        <View style={[styles.actionBadge, { backgroundColor: palette.accent.brand }]}>
          <Text style={[styles.actionText, { color: palette.background.primary }]}>
            {approvalData.action}
          </Text>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>CONTEXT</Text>
        {Object.entries(approvalData.context ?? {}).map(([key, value]) => (
          <View key={key} style={[styles.contextRow, { borderColor: palette.border.default }]}>
            <Text style={[styles.contextKey, { color: palette.text.secondary }]}>{key}</Text>
            <Text style={[styles.contextValue, { color: palette.text.primary }]}>
              {formatContextValue(value)}
            </Text>
          </View>
        ))}

        {deadlineInfo ? (
          <View
            style={[
              styles.deadlineBanner,
              {
                borderColor: deadlineInfo.urgent ? palette.accent.danger : palette.border.default,
                backgroundColor: palette.background.card,
              },
            ]}
          >
            <Text
              style={[
                styles.deadlineText,
                { color: deadlineInfo.urgent ? palette.accent.danger : palette.text.secondary },
              ]}
            >
              {deadlineInfo.label}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.reasonLabel, { color: palette.text.secondary }]}>
          Reason for rejection (optional)
        </Text>
        <TextInput
          style={[
            styles.reasonInput,
            {
              color: palette.text.primary,
              borderColor: palette.border.default,
              backgroundColor: palette.background.card,
            },
          ]}
          multiline
          value={reason}
          onChangeText={setReason}
          placeholder="Add context for the requester"
          placeholderTextColor={palette.text.muted}
          textAlignVertical="top"
        />

        <View style={styles.buttonRow}>
          <Pressable
            style={[
              styles.button,
              styles.approveButton,
              {
                backgroundColor: palette.accent.brand,
                opacity: loading !== null ? 0.7 : 1,
              },
            ]}
            disabled={loading !== null}
            onPress={() => {
              void handleApprove();
            }}
          >
            {loading === 'approve' ? (
              <ActivityIndicator size="small" color={palette.background.primary} />
            ) : (
              <Text style={[styles.buttonText, { color: palette.background.primary }]}>
                Approve
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[
              styles.button,
              styles.rejectButton,
              {
                borderColor: palette.accent.danger,
                opacity: loading !== null ? 0.7 : 1,
              },
            ]}
            disabled={loading !== null}
            onPress={() => {
              void handleReject();
            }}
          >
            {loading === 'reject' ? (
              <ActivityIndicator size="small" color={palette.accent.danger} />
            ) : (
              <Text style={[styles.buttonText, { color: palette.accent.danger }]}>Reject</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[8],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  actionBadge: {
    alignSelf: 'flex-start',
    borderRadius: spacing[6],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  actionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0.8,
  },
  contextRow: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[1],
  },
  contextKey: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
  },
  contextValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 20,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  deadlineBanner: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  deadlineText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  reasonLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  reasonInput: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rejectButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  buttonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
