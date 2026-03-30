import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { queryClient } from '../../lib/query-client';
import { sdk } from '../../lib/sdk';
import { useSessionStore } from '../../lib/session';

type Step = 1 | 2 | 3 | 4;
type FirstActionKind = 'shopping' | 'chore';
type WizardLoadingState =
  | null
  | 'create-household'
  | 'invite'
  | 'share-link'
  | 'submit-first-action'
  | 'continue-step-3';

type HouseholdMemberStatus = 'active' | 'away' | 'pending';
type HouseholdMember = {
  household_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by: string | null;
  joined_at: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
};

function initialsForMember(userId: string): string {
  const normalized = userId.trim();
  if (normalized.length === 0) {
    return '?';
  }

  return normalized
    .replace(/[^A-Za-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function memberStatus(status: string): HouseholdMemberStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'active' || normalized === 'joined') {
    return 'active';
  }
  if (normalized === 'pending' || normalized === 'invited') {
    return 'pending';
  }
  return 'away';
}

export default function HouseholdOnboardingModal() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const router = useRouter();
  const currentUserId = useSessionStore((state) => state.user?.id) ?? 'user_stub_001';

  const [step, setStep] = useState<Step>(1);
  const [householdName, setHouseholdName] = useState('');
  const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState('');
  const [invitedAddresses, setInvitedAddresses] = useState<string[]>([]);

  const [firstActionKind, setFirstActionKind] = useState<FirstActionKind>('shopping');
  const [shoppingTitle, setShoppingTitle] = useState('');
  const [choreTitle, setChoreTitle] = useState('');
  const [firstActionDone, setFirstActionDone] = useState(false);

  const [loading, setLoading] = useState<WizardLoadingState>(null);
  const [error, setError] = useState<string | null>(null);

  const householdId = createdHouseholdId;

  const { data: members = [] } = useQuery({
    queryKey: ['household', householdId, 'members'],
    enabled: Boolean(householdId),
    queryFn: () => sdk.household.listMembers(householdId as string),
  });

  const handleCreateHousehold = useCallback(async () => {
    const trimmed = householdName.trim();
    if (trimmed.length < 1) {
      setError('Household name is required.');
      return;
    }

    setError(null);
    setLoading('create-household');

    try {
      const household = await sdk.household.createHousehold(trimmed);
      setCreatedHouseholdId(household.id);
      await useSessionStore.getState().setHouseholdId(household.id);
      setStep(2);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to create household';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [householdName]);

  const handleInvite = useCallback(async () => {
    if (!householdId) {
      setError('Create the household before inviting members.');
      return;
    }

    const invitedUserId = inviteInput.trim();
    if (invitedUserId.length === 0) {
      return;
    }

    setError(null);
    setLoading('invite');

    try {
      const invited = await sdk.household.inviteMember(householdId, invitedUserId, 'Adult');
      setInvitedAddresses((current) => [invitedUserId, ...current]);
      const existing =
        queryClient.getQueryData<HouseholdMember[]>(['household', householdId, 'members']) ?? [];
      queryClient.setQueryData<HouseholdMember[]>(['household', householdId, 'members'], [
        ...existing,
        invited,
      ]);
      setInviteInput('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to send invite';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [householdId, inviteInput]);

  const handleShareInviteLink = useCallback(async () => {
    if (!householdId) {
      setError('Create the household before sharing an invite link.');
      return;
    }

    setError(null);
    setLoading('share-link');

    try {
      const invite = await sdk.household.createInviteLink(householdId, 'Adult');
      await Share.share({
        message: invite.inviteUrl,
        url: invite.inviteUrl,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to share invite link';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [householdId]);

  const handleSubmitFirstAction = useCallback(async () => {
    if (!householdId) {
      setError('Household is missing.');
      return;
    }

    setError(null);
    setLoading('submit-first-action');

    try {
      if (firstActionKind === 'shopping') {
        const title = shoppingTitle.trim();
        if (title.length === 0) {
          setError('Enter an item name to continue.');
          setLoading(null);
          return;
        }
        await sdk.household.addShoppingItem(householdId, title, 'manual');
      }

      if (firstActionKind === 'chore') {
        const title = choreTitle.trim();
        if (title.length === 0) {
          setError('Enter a chore title to continue.');
          setLoading(null);
          return;
        }
        await sdk.household.createChore(householdId, title, currentUserId, new Date().toISOString());
      }

      setFirstActionDone(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save first shared action';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [choreTitle, currentUserId, firstActionKind, householdId, shoppingTitle]);

  const handleNextFromStep3 = useCallback(async () => {
    if (!firstActionDone) {
      return;
    }

    setLoading('continue-step-3');
    setStep(4);
    setLoading(null);
  }, [firstActionDone]);

  const dotStyles = useMemo(
    () =>
      [1, 2, 3, 4].map((index) => {
        const isActive = step === index;
        const isComplete = index < step;
        return {
          key: index,
          width: isActive ? 24 : 10,
          backgroundColor: isComplete ? '#20C997' : isActive ? palette.accent.brand : palette.border.default,
        };
      }),
    [palette.accent.brand, palette.border.default, step],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dotsRow}>
          {dotStyles.map((dot) => (
            <View
              key={dot.key}
              style={[
                styles.dot,
                {
                  width: dot.width,
                  backgroundColor: dot.backgroundColor,
                },
              ]}
            />
          ))}
        </View>

        {error ? <Text style={[styles.errorText, { color: palette.accent.danger }]}>{error}</Text> : null}

        {step === 1 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>Name the household</Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: palette.border.default,
                  backgroundColor: palette.background.card,
                  color: palette.text.primary,
                },
              ]}
              value={householdName}
              onChangeText={setHouseholdName}
              placeholder="e.g. Pine Street Home"
              placeholderTextColor={palette.text.muted}
            />
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand, opacity: loading ? 0.7 : 1 }]}
              disabled={loading !== null}
              onPress={() => {
                void handleCreateHousehold();
              }}
            >
              {loading === 'create-household' ? (
                <ActivityIndicator size="small" color={palette.background.primary} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue →</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.back()}
              disabled={loading !== null}
            >
              <Text style={[styles.secondaryButtonText, { color: palette.text.secondary }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>Invite members</Text>
            <View style={styles.inviteRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.inviteInput,
                  {
                    borderColor: palette.border.default,
                    backgroundColor: palette.background.card,
                    color: palette.text.primary,
                  },
                ]}
                value={inviteInput}
                onChangeText={setInviteInput}
                placeholder="Email or phone"
                placeholderTextColor={palette.text.muted}
              />
              <Pressable
                style={[styles.inviteButton, { backgroundColor: palette.accent.brand, opacity: loading ? 0.7 : 1 }]}
                disabled={loading !== null}
                onPress={() => {
                  void handleInvite();
                }}
              >
                {loading === 'invite' ? (
                  <ActivityIndicator size="small" color={palette.background.primary} />
                ) : (
                  <Text style={[styles.inviteButtonText, { color: palette.background.primary }]}>Invite</Text>
                )}
              </Pressable>
            </View>

            <Pressable
              style={[styles.linkButton, { borderColor: palette.border.default, opacity: loading ? 0.7 : 1 }]}
              disabled={loading !== null}
              onPress={() => {
                void handleShareInviteLink();
              }}
            >
              {loading === 'share-link' ? (
                <ActivityIndicator size="small" color={palette.text.secondary} />
              ) : (
                <Text style={[styles.linkButtonText, { color: palette.text.secondary }]}>Share invite link</Text>
              )}
            </Pressable>

            <View style={styles.chipsRow}>
              {invitedAddresses.map((address, index) => (
                <View key={`${address}-${index}`} style={[styles.chip, { borderColor: palette.border.default }]}> 
                  <Text style={[styles.chipText, { color: palette.text.secondary }]}>{address}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(3)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue →</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setStep(3)}>
              <Text style={[styles.secondaryButtonText, { color: palette.text.secondary }]}>Skip for now</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>First shared action</Text>

            <View style={styles.actionCardsColumn}>
              {[
                { key: 'shopping', title: 'Add a shopping item' },
                { key: 'chore', title: 'Create a chore' },
              ].map((action) => {
                const selected = firstActionKind === action.key;
                return (
                  <Pressable
                    key={action.key}
                    style={[
                      styles.actionCard,
                      {
                        borderColor: selected ? palette.accent.brand : palette.border.default,
                        backgroundColor: palette.background.card,
                      },
                    ]}
                    onPress={() => {
                      setFirstActionKind(action.key as FirstActionKind);
                      setFirstActionDone(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.actionCardText,
                        { color: selected ? palette.accent.brand : palette.text.secondary },
                      ]}
                    >
                      {action.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {firstActionKind === 'shopping' ? (
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: palette.border.default,
                    backgroundColor: palette.background.card,
                    color: palette.text.primary,
                  },
                ]}
                value={shoppingTitle}
                onChangeText={setShoppingTitle}
                placeholder="Item name"
                placeholderTextColor={palette.text.muted}
              />
            ) : null}

            {firstActionKind === 'chore' ? (
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: palette.border.default,
                    backgroundColor: palette.background.card,
                    color: palette.text.primary,
                  },
                ]}
                value={choreTitle}
                onChangeText={setChoreTitle}
                placeholder="Chore title"
                placeholderTextColor={palette.text.muted}
              />
            ) : null}

            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand, opacity: loading ? 0.7 : 1 }]}
              onPress={() => {
                void handleSubmitFirstAction();
              }}
              disabled={loading !== null}
            >
              {loading === 'submit-first-action' ? (
                <ActivityIndicator size="small" color={palette.background.primary} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Save Action</Text>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.primaryButton,
                {
                  backgroundColor: firstActionDone ? palette.accent.brand : palette.border.default,
                  opacity: firstActionDone ? 1 : 0.5,
                },
              ]}
              onPress={() => {
                void handleNextFromStep3();
              }}
              disabled={!firstActionDone || loading !== null}
            >
              {loading === 'continue-step-3' ? (
                <ActivityIndicator size="small" color={palette.background.primary} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Next</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.stepWrap}>
            <Text style={styles.houseIcon}>🏠</Text>
            <Text style={[styles.title, { color: palette.text.primary }]}>{householdName.trim() || 'Household ready'}</Text>

            <View style={styles.avatarsRow}>
              {members.length === 0 ? (
                <Text style={[styles.secondaryButtonText, { color: palette.text.muted }]}>No invited members yet</Text>
              ) : (
                members.map((member) => {
                  const status = memberStatus(member.status);
                  return (
                    <View
                      key={member.user_id}
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: status === 'active' ? palette.text.primary : '#ADB5BD',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          {
                            color:
                              status === 'active' ? palette.background.primary : palette.background.secondary,
                          },
                        ]}
                      >
                        {initialsForMember(member.user_id)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Go to Household</Text>
            </Pressable>
          </View>
        ) : null}
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
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    justifyContent: 'center',
  },
  dot: {
    height: 10,
    borderRadius: 999,
  },
  stepWrap: {
    gap: spacing[3],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  input: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.base,
  },
  primaryButton: {
    borderRadius: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  primaryButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  secondaryButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  inviteRow: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
  },
  inviteInput: {
    flex: 1,
  },
  inviteButton: {
    borderRadius: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  linkButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  linkButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    borderWidth: 1,
    borderRadius: spacing[6],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  chipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  actionCardsColumn: {
    gap: spacing[2],
  },
  actionCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  actionCardText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  houseIcon: {
    fontSize: 48,
    textAlign: 'center',
  },
  avatarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
