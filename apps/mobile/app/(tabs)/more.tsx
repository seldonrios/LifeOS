import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';
import type { AssistantProfile } from '@lifeos/contracts';

import { sdk } from '../../lib/sdk';
import { useSessionStore } from '../../lib/session';

type MoreRow = {
  label: string;
  onPress: () => void;
};

export default function MoreScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const router = useRouter();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, AssistantProfile>>({});

  const activeProfile = useSessionStore((state) => state.activeProfile);
  const assistantName = useSessionStore((state) => state.assistantName);
  const householdId = useSessionStore((state) => state.householdId);
  const setActiveProfile = useSessionStore((state) => state.setActiveProfile);

  const membersQuery = useQuery({
    queryKey: ['household-members', householdId],
    queryFn: () => sdk.household.listMembers(householdId!),
    enabled: Boolean(householdId),
  });

  useEffect(() => {
    if (!switcherVisible || !membersQuery.data || membersQuery.data.length === 0) {
      return;
    }

    void (async () => {
      const profiles = await Promise.all(
        membersQuery.data.map(async (member) => {
          try {
            const profile = await sdk.assistantProfile.get(member.user_id);
            return [member.user_id, profile] as const;
          } catch {
            return null;
          }
        }),
      );

      const nextProfiles: Record<string, AssistantProfile> = {};
      profiles.forEach((entry) => {
        if (!entry) {
          return;
        }
        nextProfiles[entry[0]] = entry[1];
      });
      setMemberProfiles(nextProfiles);
    })();
  }, [membersQuery.data, switcherVisible]);

  const rows: MoreRow[] = [
    {
      label: 'Settings',
      onPress: () => router.push('/(tabs)/settings'),
    },
    {
      label: 'Memory',
      onPress: () => router.push('/more/memory'),
    },
    {
      label: 'Integrations',
      onPress: () => router.push('/more/integrations'),
    },
    {
      label: 'Assistant Profile',
      onPress: () => router.push('/more/assistant-profile'),
    },
    {
      label: 'Diagnostics',
      onPress: () => router.push('/more/diagnostics'),
    },
    {
      label: 'Export',
      onPress: () => router.push('/more/export'),
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.profileHeader,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.profileIdentity}>
              <View
                style={[
                  styles.profileAvatar,
                  {
                    backgroundColor: palette.background.secondary,
                    borderColor: palette.border.default,
                  },
                ]}
              >
                <Text style={styles.profileAvatarText}>{activeProfile?.avatarEmoji ?? '🤖'}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={[styles.profileName, { color: palette.text.primary }]}>
                  {activeProfile?.assistantName ?? assistantName}
                </Text>
                <Text style={[styles.profileSubtitle, { color: palette.text.secondary }]}>
                  Your assistant
                </Text>
              </View>
            </View>
            {householdId ? (
              <Pressable
                style={[styles.switchButton, { borderColor: palette.accent.brand }]}
                onPress={() => {
                  setSwitcherVisible(true);
                }}
              >
                <Text style={[styles.switchButtonText, { color: palette.accent.brand }]}>Switch</Text>
              </Pressable>
            ) : null}
          </View>
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
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              style={[
                styles.rowBetween,
                index < rows.length - 1
                  ? [styles.rowBorder, { borderBottomColor: palette.border.subtle }]
                  : null,
              ]}
              onPress={row.onPress}
            >
              <Text style={[styles.labelText, { color: palette.text.primary }]}>{row.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={typography.fontSize.base}
                color={palette.text.muted}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={switcherVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSwitcherVisible(false);
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setSwitcherVisible(false);
            }}
          />
          <View style={styles.bottomSheet}>
            <Text style={[styles.sheetTitle, { color: palette.text.primary }]}>Switch profile</Text>

            {membersQuery.isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={palette.accent.brand} />
              </View>
            ) : (
              <View style={styles.memberList}>
                {(membersQuery.data ?? []).map((member) => {
                  const memberProfile = memberProfiles[member.user_id];
                  const displayName = memberProfile?.assistantName
                    ?? (member as { displayName?: string; display_name?: string }).displayName
                    ?? (member as { displayName?: string; display_name?: string }).display_name
                    ?? member.user_id;
                  const isActive = activeProfile?.userId === member.user_id;
                  return (
                    <Pressable
                      key={member.user_id}
                      style={[styles.memberRow, { borderBottomColor: palette.border.subtle }]}
                      onPress={() => {
                        void sdk.assistantProfile.get(member.user_id).then((profile) => {
                          setActiveProfile(profile);
                          setSwitcherVisible(false);
                        });
                      }}
                    >
                      <View style={styles.memberIdentity}>
                        <View
                          style={[
                            styles.memberAvatar,
                            {
                              borderColor: palette.border.default,
                              backgroundColor: palette.background.secondary,
                            },
                          ]}
                        >
                          <Text style={styles.memberAvatarText}>{memberProfile?.avatarEmoji ?? '👤'}</Text>
                        </View>
                        <Text style={[styles.memberName, { color: palette.text.primary }]}>{displayName}</Text>
                      </View>
                      {isActive ? (
                        <View
                          style={[styles.activeBadge, { backgroundColor: palette.background.secondary }]}
                        >
                          <Text style={[styles.activeBadgeText, { color: palette.text.secondary }]}>Active</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  profileHeader: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  labelText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
  },
  profileIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  profileAvatar: {
    width: spacing[12],
    height: spacing[12],
    borderRadius: spacing[6],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: typography.fontSize.xl,
  },
  profileCopy: {
    gap: spacing[1],
  },
  profileName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  profileSubtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  switchButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  switchButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: spacing[4],
    borderTopRightRadius: spacing[4],
    padding: spacing[4],
    minHeight: spacing[40],
    gap: spacing[3],
  },
  sheetTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
  },
  memberList: {
    gap: spacing[1],
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  memberAvatar: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: spacing[4],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: typography.fontSize.base,
  },
  memberName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
  },
  activeBadge: {
    borderRadius: spacing[2],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  activeBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
