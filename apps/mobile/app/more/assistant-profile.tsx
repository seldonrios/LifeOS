import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import type { AssistantProfile } from '@lifeos/contracts';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

import { sdk } from '../../lib/sdk';
import { useSessionStore } from '../../lib/session';

const ASSISTANT_TONES = ['concise', 'detailed', 'conversational'] as const;
const ASSISTANT_USE_CASE_OPTIONS = [
  'Tasks & reminders',
  'Planning projects',
  'Daily reviews',
  'Calendar awareness',
  'Research & summaries',
  'Voice capture',
] as const;

type AssistantTone = (typeof ASSISTANT_TONES)[number];

export default function AssistantProfileScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const sessionAssistantName = useSessionStore((state) => state.assistantName);

  const [draftAssistantName, setDraftAssistantName] = useState('LifeOS');
  const [draftAvatarEmoji, setDraftAvatarEmoji] = useState('🤖');
  const [draftWakePhrase, setDraftWakePhrase] = useState('Hey LifeOS');
  const [draftAssistantTone, setDraftAssistantTone] = useState<AssistantTone>('concise');
  const [draftUseCases, setDraftUseCases] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const { data, isError } = useQuery({
    queryKey: ['assistant-profile'],
    queryFn: () => sdk.assistantProfile.get(),
  });

  const profileMutation = useMutation({
    mutationFn: (draft: Partial<AssistantProfile>) => sdk.assistantProfile.upsert(draft),
    onSuccess: (savedProfile) => {
      useSessionStore.getState().setActiveProfile(savedProfile);
      setSaveStatus('saved');
    },
    onError: () => {
      setSaveStatus('error');
    },
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    setDraftAssistantName(data.assistantName ?? 'LifeOS');
    setDraftAvatarEmoji(data.avatarEmoji ?? '🤖');
    setDraftWakePhrase(data.wakePhrase ?? 'Hey LifeOS');
    setDraftAssistantTone((data.assistantTone ?? 'concise') as AssistantTone);
    setDraftUseCases(data.useCases ?? []);
    setSaveStatus('idle');
  }, [data]);

  useEffect(() => {
    if (!isError || data) {
      return;
    }

    setDraftAssistantName(sessionAssistantName || 'LifeOS');
    setDraftAvatarEmoji('🤖');
    setDraftWakePhrase('Hey LifeOS');
    setDraftAssistantTone('concise');
    setDraftUseCases([]);
  }, [data, isError, sessionAssistantName]);

  const toggleUseCase = (label: string) => {
    setSaveStatus('idle');
    setDraftUseCases((previous) => {
      if (previous.includes(label)) {
        return previous.filter((entry) => entry !== label);
      }
      if (previous.length >= 10) {
        return previous;
      }
      return [...previous, label];
    });
  };

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
          <Text style={[styles.title, { color: palette.text.primary }]}>Assistant profile</Text>

          <View style={styles.headerRow}>
            <View
              style={[
                styles.avatar,
                {
                  borderColor: palette.border.default,
                  backgroundColor: palette.background.secondary,
                },
              ]}
            >
              <Text style={styles.avatarText}>{draftAvatarEmoji || '🤖'}</Text>
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.nameText, { color: palette.text.primary }]}>
                {draftAssistantName || 'LifeOS'}
              </Text>
              <Text style={[styles.subtitle, { color: palette.text.secondary }]}>Your personal assistant</Text>
            </View>
          </View>

          <Text style={[styles.label, { color: palette.text.secondary }]}>Assistant name</Text>
          <TextInput
            value={draftAssistantName}
            maxLength={32}
            onChangeText={(value) => {
              setDraftAssistantName(value);
              setSaveStatus('idle');
            }}
            placeholder="LifeOS"
            placeholderTextColor={palette.text.muted}
            style={[
              styles.textInput,
              {
                color: palette.text.primary,
                borderColor: palette.border.default,
                backgroundColor: palette.background.secondary,
              },
            ]}
          />

          <Text style={[styles.label, { color: palette.text.secondary }]}>Avatar emoji</Text>
          <TextInput
            value={draftAvatarEmoji}
            maxLength={2}
            onChangeText={(value) => {
              setDraftAvatarEmoji(value);
              setSaveStatus('idle');
            }}
            placeholder="🤖"
            placeholderTextColor={palette.text.muted}
            style={[
              styles.emojiInput,
              {
                color: palette.text.primary,
                borderColor: palette.border.default,
                backgroundColor: palette.background.secondary,
              },
            ]}
          />

          <Text style={[styles.label, { color: palette.text.secondary }]}>Wake phrase</Text>
          <TextInput
            value={draftWakePhrase}
            maxLength={64}
            onChangeText={(value) => {
              setDraftWakePhrase(value);
              setSaveStatus('idle');
            }}
            placeholder="Hey LifeOS"
            placeholderTextColor={palette.text.muted}
            style={[
              styles.textInput,
              {
                color: palette.text.primary,
                borderColor: palette.border.default,
                backgroundColor: palette.background.secondary,
              },
            ]}
          />
          <Text style={[styles.hint, { color: palette.text.muted }]}>Stored for future always-listening support. Not active in push-to-talk mode.</Text>

          <Text style={[styles.label, { color: palette.text.secondary }]}>Assistant tone</Text>
          <View style={styles.segmentRow}>
            {ASSISTANT_TONES.map((tone) => {
              const active = draftAssistantTone === tone;
              return (
                <Pressable
                  key={tone}
                  style={[
                    styles.segmentButton,
                    {
                      borderColor: active ? palette.accent.brand : palette.border.default,
                      backgroundColor: active ? palette.accent.brand : palette.background.secondary,
                    },
                  ]}
                  onPress={() => {
                    setDraftAssistantTone(tone);
                    setSaveStatus('idle');
                  }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? palette.background.primary : palette.text.primary },
                    ]}
                  >
                    {tone}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: palette.text.secondary }]}>Use cases</Text>
          <View style={styles.chipWrap}>
            {ASSISTANT_USE_CASE_OPTIONS.map((option) => {
              const selected = draftUseCases.includes(option);
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? palette.accent.brand : palette.border.default,
                      backgroundColor: selected ? palette.accent.brand : palette.background.secondary,
                    },
                  ]}
                  onPress={() => {
                    toggleUseCase(option);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected ? palette.background.primary : palette.text.primary,
                      },
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.saveButton, { backgroundColor: palette.accent.brand }]}
              disabled={profileMutation.isPending}
              onPress={() => {
                setSaveStatus('idle');
                void profileMutation.mutateAsync({
                  assistantName: draftAssistantName.trim() || 'LifeOS',
                  avatarEmoji: draftAvatarEmoji.trim() || '🤖',
                  wakePhrase: draftWakePhrase.trim() || 'Hey LifeOS',
                  assistantTone: draftAssistantTone,
                  useCases: draftUseCases,
                });
              }}
            >
              <Text style={[styles.saveText, { color: palette.background.primary }]}>Save profile</Text>
            </Pressable>
          </View>

          {saveStatus === 'saved' ? (
            <Text style={[styles.statusText, { color: palette.accent.success }]}>Profile saved.</Text>
          ) : null}
          {saveStatus === 'error' ? (
            <Text style={[styles.statusText, { color: palette.accent.danger }]}>Unable to save profile.</Text>
          ) : null}
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
    paddingBottom: spacing[8],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[1],
  },
  avatar: {
    width: spacing[12],
    height: spacing[12],
    borderRadius: spacing[6],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize.xl,
  },
  headerCopy: {
    gap: spacing[1],
  },
  nameText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing[1],
  },
  textInput: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  emojiInput: {
    width: spacing[18],
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  hint: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: 18,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  segmentButton: {
    borderWidth: 1,
    borderRadius: spacing[4],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  segmentText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    borderWidth: 1,
    borderRadius: spacing[4],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  actionRow: {
    marginTop: spacing[2],
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  saveButton: {
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  saveText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginTop: spacing[1],
  },
});
