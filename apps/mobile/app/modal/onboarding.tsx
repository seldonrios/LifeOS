import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';
import type { CaptureResult, HealthCheckResult } from '@lifeos/contracts';

import { sdk } from '../../lib/sdk';
import { markOnboardingComplete, ONBOARDING_COMPLETE_KEY, useSessionStore, SETUP_STYLE_KEY, USE_CASES_KEY, ASSISTANT_STYLE_KEY } from '../../lib/session';

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type SetupStyle = 'recommended' | 'private' | 'builder';
type UseCase = 'tasks' | 'planning' | 'reviews' | 'calendar' | 'research' | 'voice';
type AssistantStyle = 'concise' | 'detailed' | 'conversational';
type ServiceKey = 'calendar' | 'tasks' | 'email' | 'contacts' | 'files';
type PermissionKey = 'notifications' | 'microphone' | 'storage' | 'background';
type PermissionDecision = 'idle' | 'allowed' | 'not-now';
type ProbeStatus = 'loading' | 'pass' | 'warn' | 'fail' | 'unavailable';

const explainerSlides: Array<{ headline: string; body: string }> = [
  {
    headline: 'Capture anything',
    body: "A thought, task, reminder, or question. LifeOS holds it until you're ready to decide.",
  },
  {
    headline: "Triage when you're ready",
    body: 'Your inbox turns raw captures into tasks, plans, reminders, or notes - one decision at a time.',
  },
  {
    headline: 'Review and close loops',
    body: "A 2-minute daily review keeps you clear on what finished, what's open, and what matters tomorrow.",
  },
];

const setupOptions: Array<{ key: SetupStyle; title: string; description: string }> = [
  {
    key: 'recommended',
    title: 'Recommended',
    description: 'Fastest setup with the best default experience.',
  },
  {
    key: 'private',
    title: 'Private-first',
    description: 'Keep everything local and connect services later.',
  },
  {
    key: 'builder',
    title: 'Builder',
    description: 'Customize models, storage, and advanced options.',
  },
];

const useCaseOptions: Array<{ key: UseCase; title: string }> = [
  { key: 'tasks', title: 'Tasks & reminders' },
  { key: 'planning', title: 'Planning projects' },
  { key: 'reviews', title: 'Daily reviews' },
  { key: 'calendar', title: 'Calendar awareness' },
  { key: 'research', title: 'Research & summaries' },
  { key: 'voice', title: 'Voice capture' },
];

const assistantOptions: Array<{ key: AssistantStyle; title: string }> = [
  { key: 'concise', title: 'Concise' },
  { key: 'detailed', title: 'Detailed' },
  { key: 'conversational', title: 'Conversational' },
];

const serviceOptions: Array<{ key: ServiceKey; title: string }> = [
  { key: 'calendar', title: 'Calendar' },
  { key: 'tasks', title: 'Tasks' },
  { key: 'email', title: 'Email' },
  { key: 'contacts', title: 'Contacts' },
  { key: 'files', title: 'Files' },
];

const permissionRows: Array<{
  key: PermissionKey;
  title: string;
  reason: string;
}> = [
  {
    key: 'notifications',
    title: 'Notifications',
    reason: 'So LifeOS can remind you at the right time.',
  },
  {
    key: 'microphone',
    title: 'Microphone',
    reason: 'For voice capture. Never recorded without your action.',
  },
  {
    key: 'storage',
    title: 'Local storage',
    reason: 'To keep your data on this device.',
  },
  {
    key: 'background',
    title: 'Background refresh',
    reason: 'To sync reminders while the app is closed.',
  },
];

export default function OnboardingModal() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const router = useRouter();
  const setOnboardingComplete = useSessionStore((state) => state.setOnboardingComplete);

  const [step, setStep] = useState<OnboardingStep>(1);
  const [setupStyle, setSetupStyle] = useState<SetupStyle>('recommended');
  const [selectedUseCases, setSelectedUseCases] = useState<Set<UseCase>>(new Set());
  const [assistantStyle, setAssistantStyle] = useState<AssistantStyle>('concise');
  const [proactiveToggle, setProactiveToggle] = useState(false);
  const [askBeforeActingToggle, setAskBeforeActingToggle] = useState(true);
  const [captureText, setCaptureText] = useState('');
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(false);
  const [notificationsOk, setNotificationsOk] = useState(false);
  const [connectedServices, setConnectedServices] = useState<Set<ServiceKey>>(new Set());
  const [skippedServices, setSkippedServices] = useState<Set<ServiceKey>>(new Set());
  const [permissionState, setPermissionState] = useState<Record<PermissionKey, PermissionDecision>>({
    notifications: 'idle',
    microphone: 'idle',
    storage: 'idle',
    background: 'idle',
  });
  const [showExplainer, setShowExplainer] = useState(false);
  const [explainerSlide, setExplainerSlide] = useState<0 | 1 | 2>(0);
  const [modelProbeStatus, setModelProbeStatus] = useState<ProbeStatus>('loading');
  const [eventBusProbeStatus, setEventBusProbeStatus] = useState<ProbeStatus>('loading');
  const [modelRepairAction, setModelRepairAction] = useState<HealthCheckResult['repairAction']>(null);
  const [eventBusRepairAction, setEventBusRepairAction] = useState<HealthCheckResult['repairAction']>(null);

  useEffect(() => {
    if (step !== 7) {
      return;
    }

    setModelProbeStatus('loading');
    setEventBusProbeStatus('loading');
    setModelRepairAction(null);
    setEventBusRepairAction(null);

    let cancelled = false;

    void (async () => {
      const [storageResult, notificationPermission] = await Promise.allSettled([
        AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
        Notifications.getPermissionsAsync(),
      ]);

      if (cancelled) {
        return;
      }

      setStorageOk(storageResult.status === 'fulfilled');
      setNotificationsOk(
        notificationPermission.status === 'fulfilled' && notificationPermission.value.status === 'granted',
      );

      try {
        const results = await sdk.ux.healthCheck();

        if (cancelled) {
          return;
        }

        const modelResult = results.find((result) => result.key === 'model');
        const eventBusResult = results.find((result) => result.key === 'eventBus');

        setModelProbeStatus(modelResult?.status ?? 'unavailable');
        setEventBusProbeStatus(eventBusResult?.status ?? 'unavailable');
        setModelRepairAction(modelResult?.repairAction ?? null);
        setEventBusRepairAction(eventBusResult?.repairAction ?? null);
      } catch {
        if (cancelled) {
          return;
        }

        setModelProbeStatus('unavailable');
        setEventBusProbeStatus('unavailable');
        setModelRepairAction(null);
        setEventBusRepairAction(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step]);

  const dotStyles = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => {
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

  const previewTitle = captureResult?.content || 'Review the note you just captured';

  function getProbeLabel(status: ProbeStatus): 'Checking...' | 'Pass' | 'Warn' | 'Fail' | 'Unavailable' {
    if (status === 'loading') {
      return 'Checking...';
    }
    if (status === 'pass') {
      return 'Pass';
    }
    if (status === 'warn') {
      return 'Warn';
    }
    if (status === 'fail') {
      return 'Fail';
    }
    return 'Unavailable';
  }

  function handleRepairAction(action: string) {
    switch (action) {
      case 'check-ollama':
      case 'check-nats':
      case 'open-settings':
      case 'set-jwt-secret':
        router.push('/modal/settings');
        return;
      case 'configure-notifications':
        setStep(6);
        return;
      default:
        // Fallback to settings so repair links never become a no-op.
        router.push('/modal/settings');
        return;
    }
  }

  function toggleUseCase(useCase: UseCase) {
    setSelectedUseCases((current) => {
      const next = new Set(current);
      if (next.has(useCase)) {
        next.delete(useCase);
      } else {
        next.add(useCase);
      }
      return next;
    });
  }

  function toggleServiceConnected(service: ServiceKey) {
    setConnectedServices((current) => {
      const next = new Set(current);
      next.add(service);
      return next;
    });

    setSkippedServices((current) => {
      const next = new Set(current);
      next.delete(service);
      return next;
    });
  }

  function skipServiceForNow(service: ServiceKey) {
    setSkippedServices((current) => {
      const next = new Set(current);
      next.add(service);
      return next;
    });

    setConnectedServices((current) => {
      const next = new Set(current);
      next.delete(service);
      return next;
    });
  }

  async function handlePermissionAllow(permission: PermissionKey) {
    try {
      if (permission === 'notifications') {
        const result = await Notifications.requestPermissionsAsync();
        setNotificationsOk(result.status === 'granted');
      }

      if (permission === 'microphone') {
        await Audio.requestPermissionsAsync();
      }

      if (permission === 'storage') {
        setStorageOk(true);
      }

      setPermissionState((current) => ({
        ...current,
        [permission]: 'allowed',
      }));
    } catch {
      setPermissionState((current) => ({
        ...current,
        [permission]: 'not-now',
      }));
    }
  }

  function handlePermissionSkip(permission: PermissionKey) {
    setPermissionState((current) => ({
      ...current,
      [permission]: 'not-now',
    }));
  }

  async function handleCapture() {
    const trimmed = captureText.trim();
    if (trimmed.length === 0) {
      setError('Enter something to capture before continuing.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await sdk.capture.create({ type: 'text', content: trimmed });
      setCaptureResult(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to capture this item.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        AsyncStorage.setItem(SETUP_STYLE_KEY, setupStyle),
        AsyncStorage.setItem(USE_CASES_KEY, JSON.stringify([...selectedUseCases])),
        AsyncStorage.setItem(ASSISTANT_STYLE_KEY, assistantStyle),
      ]);
      await markOnboardingComplete();
      setOnboardingComplete(true);
      router.replace('/(tabs)/home');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to complete onboarding.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {step >= 2 && step <= 8 ? (
          <Pressable style={styles.backButton} onPress={() => setStep((step - 1) as OnboardingStep)}>
            <Text style={[styles.backButtonText, { color: palette.text.secondary }]}>Back</Text>
          </Pressable>
        ) : null}

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
            <Text style={[styles.title, { color: palette.text.primary }]}>Welcome to LifeOS</Text>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
              Your local-first system for capturing thoughts, planning clearly, and staying on top of what
              matters.
            </Text>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(2)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Get started</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setExplainerSlide(0);
                setShowExplainer(true);
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: palette.text.secondary }]}>See how it works</Text>
            </Pressable>
            <Text style={[styles.footerNote, { color: palette.text.muted }]}>Designed to work locally. You stay in control.</Text>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>Choose your setup style</Text>
            <View style={styles.cardsColumn}>
              {setupOptions.map((option) => {
                const selected = setupStyle === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.actionCard,
                      {
                        borderColor: selected ? palette.accent.brand : palette.border.default,
                        backgroundColor: palette.background.card,
                      },
                    ]}
                    onPress={() => setSetupStyle(option.key)}
                  >
                    <Text style={[styles.cardTitle, { color: palette.text.primary }]}>{option.title}</Text>
                    <Text style={[styles.cardDescription, { color: palette.text.secondary }]}>{option.description}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(3)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>What will you use LifeOS for?</Text>
            <View style={styles.cardsColumn}>
              {useCaseOptions.map((option) => {
                const selected = selectedUseCases.has(option.key);
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.actionCard,
                      {
                        borderColor: selected ? palette.accent.brand : palette.border.default,
                        backgroundColor: palette.background.card,
                      },
                    ]}
                    onPress={() => toggleUseCase(option.key)}
                  >
                    <Text
                      style={[
                        styles.actionCardText,
                        { color: selected ? palette.accent.brand : palette.text.secondary },
                      ]}
                    >
                      {option.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(4)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>How should your assistant respond?</Text>
            <View style={styles.cardsColumn}>
              {assistantOptions.map((option) => {
                const selected = assistantStyle === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.actionCard,
                      {
                        borderColor: selected ? palette.accent.brand : palette.border.default,
                        backgroundColor: palette.background.card,
                      },
                    ]}
                    onPress={() => setAssistantStyle(option.key)}
                  >
                    <Text
                      style={[
                        styles.actionCardText,
                        { color: selected ? palette.accent.brand : palette.text.secondary },
                      ]}
                    >
                      {option.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.toggleRow, { borderColor: palette.border.default, backgroundColor: palette.background.card }]}>
              <View style={styles.toggleCopy}>
                <Text style={[styles.cardTitle, { color: palette.text.primary }]}>Proactive suggestions</Text>
              </View>
              <Switch value={proactiveToggle} onValueChange={setProactiveToggle} />
            </View>

            <View style={[styles.toggleRow, { borderColor: palette.border.default, backgroundColor: palette.background.card }]}>
              <View style={styles.toggleCopy}>
                <Text style={[styles.cardTitle, { color: palette.text.primary }]}>Ask before acting</Text>
              </View>
              <Switch value={askBeforeActingToggle} onValueChange={setAskBeforeActingToggle} />
            </View>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(5)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 5 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>Connect your services</Text>
            <View style={styles.cardsColumn}>
              {serviceOptions.map((service) => {
                const connected = connectedServices.has(service.key);
                const skipped = skippedServices.has(service.key);
                return (
                  <View
                    key={service.key}
                    style={[
                      styles.serviceCard,
                      {
                        borderColor: connected || skipped ? palette.accent.brand : palette.border.default,
                        backgroundColor: palette.background.card,
                      },
                    ]}
                  >
                    <View style={styles.serviceCardHeader}>
                      <View style={styles.serviceTitleWrap}>
                        <Text style={[styles.cardTitle, { color: palette.text.primary }]}>{service.title}</Text>
                        {skipped ? (
                          <Text style={[styles.serviceStatusText, { color: palette.text.secondary }]}>Skipped for now</Text>
                        ) : null}
                      </View>
                      <Pressable
                        style={[
                          styles.connectButton,
                          {
                            backgroundColor: connected ? '#20C997' : palette.accent.brand,
                          },
                        ]}
                        onPress={() => toggleServiceConnected(service.key)}
                      >
                        <Text style={[styles.connectButtonText, { color: palette.background.primary }]}>
                          {connected ? 'Connected ✓' : 'Connect'}
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable onPress={() => skipServiceForNow(service.key)}>
                      <Text style={[styles.linkText, { color: skipped ? palette.accent.brand : palette.text.secondary }]}>
                        {skipped ? 'Skipped' : 'Skip for now'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setStep(6)}>
              <Text style={[styles.secondaryButtonText, { color: palette.text.secondary }]}>Skip all for now</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(6)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 6 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>Permissions & privacy</Text>
            <View style={styles.cardsColumn}>
              {permissionRows.map((permission) => (
                <View
                  key={permission.key}
                  style={[
                    styles.permissionCard,
                    { borderColor: palette.border.default, backgroundColor: palette.background.card },
                  ]}
                >
                  <View style={styles.permissionCopy}>
                    <Text style={[styles.cardTitle, { color: palette.text.primary }]}>{permission.title}</Text>
                    <Text style={[styles.cardDescription, { color: palette.text.secondary }]}>{permission.reason}</Text>
                  </View>
                  <View style={styles.permissionActions}>
                    <Pressable
                      style={[styles.permissionButton, { backgroundColor: palette.accent.brand }]}
                      onPress={() => {
                        void handlePermissionAllow(permission.key);
                      }}
                    >
                      <Text style={[styles.permissionButtonText, { color: palette.background.primary }]}>Allow</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.permissionButton, { backgroundColor: palette.border.default }]}
                      onPress={() => handlePermissionSkip(permission.key)}
                    >
                      <Text style={[styles.permissionButtonText, { color: palette.text.primary }]}>Not now</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setStep(7)}>
              <Text style={[styles.secondaryButtonText, { color: palette.text.secondary }]}>Skip for now</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(7)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 7 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>You&apos;re ready to start</Text>
            <View style={styles.statusList}>
              <View style={styles.statusRow}>
                <Text style={styles.statusIcon}>{storageOk ? '✅' : '⚠️'}</Text>
                <Text style={[styles.statusLabel, { color: palette.text.primary }]}>Local storage</Text>
                <Text style={[styles.statusValue, { color: palette.text.secondary }]}>{storageOk ? 'Pass' : 'Fail'}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusIcon}>{notificationsOk ? '✅' : '⚠️'}</Text>
                <Text style={[styles.statusLabel, { color: palette.text.primary }]}>Notifications</Text>
                <Text style={[styles.statusValue, { color: palette.text.secondary }]}>
                  {notificationsOk ? 'Granted' : 'Skipped'}
                </Text>
              </View>
              <View>
                <View style={styles.statusRow}>
                  {modelProbeStatus === 'loading' ? (
                    <ActivityIndicator size="small" color={palette.accent.brand} />
                  ) : (
                    <Text style={styles.statusIcon}>{modelProbeStatus === 'pass' ? '✅' : '⚠️'}</Text>
                  )}
                  <Text style={[styles.statusLabel, { color: palette.text.primary }]}>AI assistant</Text>
                  <Text style={[styles.statusValue, { color: palette.text.secondary }]}>
                    {getProbeLabel(modelProbeStatus)}
                  </Text>
                </View>
                {modelRepairAction && modelProbeStatus !== 'pass' && modelProbeStatus !== 'loading' ? (
                  <Pressable
                    style={styles.repairLink}
                    onPress={() => {
                      handleRepairAction(modelRepairAction.action);
                    }}
                  >
                    <Text style={[styles.linkText, { color: palette.accent.brand }]}>{modelRepairAction.label}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View>
                <View style={styles.statusRow}>
                  {eventBusProbeStatus === 'loading' ? (
                    <ActivityIndicator size="small" color={palette.accent.brand} />
                  ) : (
                    <Text style={styles.statusIcon}>{eventBusProbeStatus === 'pass' ? '✅' : '⚠️'}</Text>
                  )}
                  <Text style={[styles.statusLabel, { color: palette.text.primary }]}>Sync engine</Text>
                  <Text style={[styles.statusValue, { color: palette.text.secondary }]}>
                    {getProbeLabel(eventBusProbeStatus)}
                  </Text>
                </View>
                {eventBusRepairAction && eventBusProbeStatus !== 'pass' && eventBusProbeStatus !== 'loading' ? (
                  <Pressable
                    style={styles.repairLink}
                    onPress={() => {
                      handleRepairAction(eventBusRepairAction.action);
                    }}
                  >
                    <Text style={[styles.linkText, { color: palette.accent.brand }]}>{eventBusRepairAction.label}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
              onPress={() => setStep(8)}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 8 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>What&apos;s one thing you need to do or remember?</Text>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>Enter anything — a task, a thought, a reminder, or a question.</Text>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                {
                  borderColor: palette.border.default,
                  backgroundColor: palette.background.card,
                  color: palette.text.primary,
                },
              ]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={captureText}
              onChangeText={setCaptureText}
              placeholder="Capture a task, note, reminder, or question"
              placeholderTextColor={palette.text.muted}
            />
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand, opacity: loading ? 0.7 : 1 }]}
              onPress={() => {
                void handleCapture();
              }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={palette.background.primary} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Capture it</Text>
              )}
            </Pressable>

            {captureResult ? (
              <View
                style={[
                  styles.resultCard,
                  { borderColor: palette.border.default, backgroundColor: palette.background.card },
                ]}
              >
                <Text style={[styles.resultLabel, { color: palette.text.secondary }]}>Captured</Text>
                <Text style={[styles.resultContent, { color: palette.text.primary }]}>{captureResult.content}</Text>
                <Text style={[styles.resultMeta, { color: palette.text.secondary }]}>
                  LifeOS thinks this is a {captureResult.type}
                </Text>
                <Text style={[styles.resultMeta, { color: palette.text.secondary }]}>Suggested next action: Review this in your inbox</Text>
                <View style={styles.chipsRow}>
                  {['+ Add reminder', 'Save as note', 'Turn into plan'].map((chip) => (
                    <Pressable
                      key={chip}
                      style={[styles.chip, { borderColor: palette.border.default, backgroundColor: palette.background.primary }]}
                    >
                      <Text style={[styles.chipText, { color: palette.text.secondary }]}>{chip}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.primaryButton,
                {
                  backgroundColor: captureResult ? palette.accent.brand : palette.border.default,
                  opacity: captureResult ? 1 : 0.5,
                },
              ]}
              onPress={() => setStep(9)}
              disabled={captureResult === null}
            >
              <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Next →</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 9 ? (
          <View style={styles.stepWrap}>
            <Text style={[styles.title, { color: palette.text.primary }]}>You&apos;re all set!</Text>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>Here&apos;s a preview of your Today screen.</Text>
            <View
              style={[
                styles.previewCard,
                { borderColor: palette.border.default, backgroundColor: palette.background.card },
              ]}
            >
              <View style={styles.previewSection}>
                <Text style={[styles.previewLabel, { color: palette.text.secondary }]}>Next action</Text>
                <Text style={[styles.previewValue, { color: palette.text.primary }]}>{previewTitle}</Text>
              </View>
              <View style={styles.previewSection}>
                <Text style={[styles.previewLabel, { color: palette.text.secondary }]}>Inbox</Text>
                <Text style={[styles.previewValue, { color: palette.text.primary }]}>Review your first captured item</Text>
              </View>
              <View style={styles.previewSection}>
                <Text style={[styles.previewLabel, { color: palette.text.secondary }]}>Reminder</Text>
                <Text style={[styles.previewValue, { color: palette.text.primary }]}>Set a follow-up when you&apos;re ready</Text>
              </View>
            </View>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: palette.accent.brand, opacity: loading ? 0.7 : 1 }]}
              onPress={() => {
                void handleFinish();
              }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={palette.background.primary} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>Go to Today</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showExplainer}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowExplainer(false)}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: palette.background.primary }]}>
          <View style={styles.content}>
            <Pressable style={styles.explainerDismiss} onPress={() => setShowExplainer(false)}>
              <Text style={[styles.explainerDismissText, { color: palette.text.secondary }]}>X</Text>
            </Pressable>
            <View style={styles.stepWrap}>
              <Text style={[styles.title, { color: palette.text.primary }]}>{explainerSlides[explainerSlide].headline}</Text>
              <Text style={[styles.bodyText, { color: palette.text.secondary }]}>{explainerSlides[explainerSlide].body}</Text>
              <View style={styles.dotsRow}>
                {[0, 1, 2].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      {
                        width: explainerSlide === index ? 24 : 10,
                        backgroundColor:
                          explainerSlide === index ? palette.accent.brand : palette.border.default,
                      },
                    ]}
                  />
                ))}
              </View>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: palette.accent.brand }]}
                onPress={() => {
                  if (explainerSlide < 2) {
                    setExplainerSlide((explainerSlide + 1) as 0 | 1 | 2);
                    return;
                  }

                  setShowExplainer(false);
                }}
              >
                <Text style={[styles.primaryButtonText, { color: palette.background.primary }]}>
                  {explainerSlide < 2 ? 'Next' : 'Done'}
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
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
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
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
  bodyText: {
    fontSize: typography.fontSize.base,
    lineHeight: 24,
  },
  footerNote: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  cardsColumn: {
    gap: spacing[2],
  },
  actionCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[1],
  },
  actionCardText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  cardDescription: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  toggleRow: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  toggleCopy: {
    flex: 1,
  },
  serviceCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  serviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  serviceTitleWrap: {
    flex: 1,
    gap: spacing[1],
  },
  serviceStatusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  connectButton: {
    minHeight: 36,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  linkText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  repairLink: {
    marginLeft: spacing[6],
  },
  permissionCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  permissionCopy: {
    gap: spacing[1],
  },
  permissionActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  permissionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  permissionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  statusList: {
    gap: spacing[2],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statusIcon: {
    fontSize: typography.fontSize.base,
  },
  statusLabel: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  statusValue: {
    fontSize: typography.fontSize.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.base,
  },
  multilineInput: {
    minHeight: 96,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  resultLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
  },
  resultContent: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  resultMeta: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
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
  previewCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  previewSection: {
    gap: spacing[1],
  },
  previewLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
  },
  previewValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
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
  explainerDismiss: {
    position: 'absolute',
    top: spacing[4],
    right: spacing[4],
    zIndex: 1,
  },
  explainerDismissText: {
    fontSize: typography.fontSize.xl,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});