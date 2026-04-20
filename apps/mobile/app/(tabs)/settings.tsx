import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { DeviceInfo } from '@lifeos/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore, WAKE_PHRASE_KEY } from '../../lib/session';
import { ErrorBanner } from '../../components/ErrorBanner';
import { queryClient } from '../../lib/query-client';
import { sdk } from '../../lib/sdk';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;

  const user = useSessionStore((state) => state.user);
  const signOut = useSessionStore((state) => state.signOut);
  const biometricAvailable = useSessionStore((state) => state.biometricAvailable);
  const biometricEnabled = useSessionStore((state) => state.biometricEnabled);
  const setBiometricEnabled = useSessionStore((state) => state.setBiometricEnabled);
  const assistantName = useSessionStore((state) => state.assistantName);
  const setAssistantName = useSessionStore((state) => state.setAssistantName);

  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'undetermined'>(
    'undetermined',
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [draftAssistantName, setDraftAssistantName] = useState(assistantName);
  const [draftWakePhrase, setDraftWakePhrase] = useState('Hey LifeOS');
  const [assistantSaved, setAssistantSaved] = useState(false);

  const [notifError, setNotifError] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => sdk.devices.list(),
  });

  useEffect(() => {
    setDraftAssistantName(assistantName);
  }, [assistantName]);

  useEffect(() => {
    const loadPermissionStatus = async () => {
      try {
        const status = await Notifications.getPermissionsAsync();
        setNotifStatus(status.granted ? 'granted' : status.status);
      } catch {
        setNotifError(true);
      }
    };

    void loadPermissionStatus();
  }, []);

  useEffect(() => {
    const loadWakePhrase = async () => {
      try {
        const storedWakePhrase = await AsyncStorage.getItem(WAKE_PHRASE_KEY);
        setDraftWakePhrase(storedWakePhrase ?? 'Hey LifeOS');
      } catch {
        setDraftWakePhrase('Hey LifeOS');
      }
    };

    void loadWakePhrase();
  }, []);

  const handleRequestPermissions = async () => {
    setNotifError(false);
    try {
      const status = await Notifications.requestPermissionsAsync();
      setNotifStatus(status.granted ? 'granted' : status.status);
    } catch {
      setNotifError(true);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  };

  const handleSaveAssistant = async () => {
    await setAssistantName(draftAssistantName);
    await AsyncStorage.setItem(WAKE_PHRASE_KEY, draftWakePhrase);
    setAssistantSaved(true);
    setTimeout(() => {
      setAssistantSaved(false);
    }, 2_000);
  };

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const isGranted = notifStatus === 'granted';

  function platformIcon(
    platform: DeviceInfo['platform'],
  ): React.ComponentProps<typeof Ionicons>['name'] {
    if (platform === 'ios') return 'phone-portrait';
    if (platform === 'android') return 'logo-android';
    return 'desktop';
  }

  const handleRevoke = async (item: DeviceInfo) => {
    if (item.isCurrentDevice) {
      Alert.alert('Sign out of this device?', 'This will sign you out on this device. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            await sdk.devices.revoke(item.id);
            await signOut();
          },
        },
      ]);
      return;
    }

    try {
      await sdk.devices.revoke(item.id);
      queryClient.setQueryData<DeviceInfo[]>(['devices'], (old) =>
        (old ?? []).filter((d) => d.id !== item.id),
      );
    } catch {
      setRevokeError('Failed to revoke device. Please try again.');
    }
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
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>ACCOUNT</Text>
          <Text style={[styles.primaryText, { color: palette.text.primary }]}>
            {user?.displayName ?? 'Unknown user'}
          </Text>
          <Text style={[styles.secondaryText, { color: palette.text.secondary }]}>
            {user?.email ?? 'No email'}
          </Text>
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
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>ASSISTANT</Text>

          <Text style={[styles.labelText, { color: palette.text.secondary }]}>Assistant name</Text>
          <TextInput
            value={draftAssistantName}
            maxLength={32}
            onChangeText={setDraftAssistantName}
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
          <Text style={[styles.hintText, { color: palette.text.muted }]}> 
            Used in greetings. 1–32 characters.
          </Text>

          <Text style={[styles.labelText, { color: palette.text.secondary }]}>Wake phrase</Text>
          <TextInput
            value={draftWakePhrase}
            maxLength={64}
            onChangeText={setDraftWakePhrase}
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
          <Text style={[styles.hintText, { color: palette.text.muted }]}> 
            Stored for future use. Not active in push-to-talk mode.
          </Text>

          <Pressable
            style={[styles.outlineButton, { borderColor: palette.accent.brand }]}
            onPress={() => {
              void handleSaveAssistant();
            }}
          >
            <Text style={[styles.outlineButtonText, { color: palette.accent.brand }]}>Save</Text>
          </Pressable>

          {assistantSaved ? (
            <Text style={[styles.savedText, { color: palette.accent.success }]}>Saved ✓</Text>
          ) : null}
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
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>NOTIFICATIONS</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.labelText, { color: palette.text.secondary }]}>Status</Text>
            <Text
              style={[
                styles.statusText,
                { color: isGranted ? palette.accent.success : palette.text.muted },
              ]}
            >
              {isGranted ? 'Granted' : 'Not granted'}
            </Text>
          </View>
          {notifError ? (
            <Text style={[styles.statusText, { color: palette.accent.danger }]}>
              Unable to access notifications. Tap to retry.
            </Text>
          ) : null}
          {!isGranted ? (
            <Pressable
              style={[styles.outlineButton, { borderColor: palette.accent.brand }]}
              onPress={() => {
                void handleRequestPermissions();
              }}
            >
              <Text style={[styles.outlineButtonText, { color: palette.accent.brand }]}>
                Request permissions
              </Text>
            </Pressable>
          ) : null}
        </View>

        {biometricAvailable ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.background.card,
                borderColor: palette.border.default,
              },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>SECURITY</Text>
            <View style={styles.rowBetween}>
              <Text style={[styles.labelText, { color: palette.text.secondary }]}>
                Biometric unlock
              </Text>
              <Switch
                value={biometricEnabled}
                onValueChange={(value) => {
                  void setBiometricEnabled(value);
                }}
                trackColor={{ true: palette.accent.brand }}
              />
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background.card,
              borderColor: palette.border.default,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>TRUSTED DEVICES</Text>
          {devicesLoading ? (
            <View style={[styles.skeletonRow, { backgroundColor: palette.background.secondary }]} />
          ) : null}
          {revokeError ? <ErrorBanner message={revokeError} /> : null}
          {(devices ?? []).map((item: DeviceInfo) => (
            <View key={item.id} style={styles.rowBetween}>
              <View style={styles.deviceMeta}>
                <Ionicons
                  name={platformIcon(item.platform)}
                  size={20}
                  color={palette.text.secondary}
                />
                <View>
                  <Text style={[styles.labelText, { color: palette.text.primary }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.secondaryText, { color: palette.text.muted }]}>
                    {new Date(item.registeredAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              {item.isCurrentDevice ? (
                <View style={[styles.currentBadge, { backgroundColor: palette.accent.brand }]}>
                  <Text style={[styles.currentBadgeText, { color: palette.background.primary }]}>
                    This device
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.outlineButton, { borderColor: palette.accent.danger }]}
                  onPress={() => {
                    void handleRevoke(item);
                  }}
                >
                  <Text style={[styles.outlineButtonText, { color: palette.accent.danger }]}>
                    Revoke
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
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
          <Text style={[styles.sectionLabel, { color: palette.text.muted }]}>APP</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.labelText, { color: palette.text.secondary }]}>Version</Text>
            <Text style={[styles.valueText, { color: palette.text.primary }]}>{appVersion}</Text>
          </View>
        </View>

        <Pressable
          style={[styles.signOutButton, { backgroundColor: palette.accent.danger }]}
          onPress={() => {
            void handleSignOut();
          }}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <ActivityIndicator color={palette.background.primary} />
          ) : (
            <Text style={[styles.signOutButtonText, { color: palette.background.primary }]}>
              Sign out
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
  },
  labelText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  valueText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  primaryText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  outlineButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    alignSelf: 'flex-start',
  },
  outlineButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  signOutButton: {
    borderRadius: spacing[3],
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing[12],
  },
  signOutButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  deviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  currentBadge: {
    borderRadius: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  currentBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  skeletonRow: {
    height: spacing[8],
    borderRadius: spacing[2],
  },
  textInput: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  hintText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
  },
  savedText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
