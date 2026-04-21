import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssistantProfile } from '@lifeos/contracts';
import {
  listOllamaModels,
  loadAssistantProfile,
  readSettings,
  saveAssistantProfile,
  writeSettings,
} from '../ipc';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { TrustCenter } from './TrustCenter';
// TrustCenter folded into Settings per UX-A1 guardrail; will be surfaced as a dedicated Settings sub-section in UX-A6.

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

export function Settings(): JSX.Element {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: readSettings,
  });
  const profileQuery = useQuery({
    queryKey: ['assistant-profile'],
    queryFn: loadAssistantProfile,
  });
  const current = settingsQuery.data;
  const modelsQuery = useQuery({
    queryKey: ['settings', 'models', current?.ollamaHost ?? null],
    queryFn: listOllamaModels,
    enabled: Boolean(current),
    staleTime: 60_000,
  });

  const [draftModel, setDraftModel] = useState('llama3.1:8b');
  const [draftHost, setDraftHost] = useState('http://127.0.0.1:11434');
  const [draftNats, setDraftNats] = useState('nats://127.0.0.1:4222');
  const [draftAssistantName, setDraftAssistantName] = useState('LifeOS');
  const [draftAvatarEmoji, setDraftAvatarEmoji] = useState('🤖');
  const [draftWakePhrase, setDraftWakePhrase] = useState('Hey LifeOS');
  const [draftAssistantTone, setDraftAssistantTone] = useState<AssistantTone>('concise');
  const [draftUseCases, setDraftUseCases] = useState<string[]>([]);
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [localOnlyMode, setLocalOnlyMode] = useState(true);
  const [cloudAssistEnabled, setCloudAssistEnabled] = useState(false);
  const [trustAuditEnabled, setTrustAuditEnabled] = useState(true);
  const [transparencyTipsEnabled, setTransparencyTipsEnabled] = useState(true);
  const hasHydrated = useRef(false);
  const lastHydratedSignature = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const saveMutation = useMutation({
    mutationFn: writeSettings,
    onSuccess: (savedSettings) => {
      setHasUnsavedChanges(false);
      queryClient.setQueryData(['settings'], savedSettings);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'models'] });
    },
  });

  const profileSaveMutation = useMutation({
    mutationFn: saveAssistantProfile,
    onSuccess: () => {
      setProfileSaveStatus('saved');
      void queryClient.invalidateQueries({ queryKey: ['assistant-profile'] });
    },
    onError: () => {
      setProfileSaveStatus('error');
    },
  });

  useEffect(() => {
    if (!current) {
      return;
    }

    const currentSignature = JSON.stringify(current);
    const shouldHydrate = !hasHydrated.current || !hasUnsavedChanges;
    const isNewPayload = currentSignature !== lastHydratedSignature.current;
    if (!shouldHydrate || !isNewPayload) {
      return;
    }

    setDraftModel(current.model);
    setDraftHost(current.ollamaHost);
    setDraftNats(current.natsUrl);
    setVoiceEnabled(current.voiceEnabled);
    setLocalOnlyMode(current.localOnlyMode);
    setCloudAssistEnabled(current.cloudAssistEnabled);
    setTrustAuditEnabled(current.trustAuditEnabled);
    setTransparencyTipsEnabled(current.transparencyTipsEnabled);
    hasHydrated.current = true;
    lastHydratedSignature.current = currentSignature;
    setHasUnsavedChanges(false);
  }, [current, hasUnsavedChanges]);

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setDraftAssistantName(profileQuery.data.assistantName ?? 'LifeOS');
    setDraftAvatarEmoji(profileQuery.data.avatarEmoji ?? '🤖');
    setDraftWakePhrase(profileQuery.data.wakePhrase ?? 'Hey LifeOS');
    setDraftAssistantTone((profileQuery.data.assistantTone ?? 'concise') as AssistantTone);
    setDraftUseCases(profileQuery.data.useCases ?? []);
    setProfileSaveStatus('idle');
  }, [profileQuery.data]);

  useEffect(() => {
    if (!profileQuery.isError || !current) {
      return;
    }

    setDraftAssistantName(current.assistantName ?? 'LifeOS');
    setDraftWakePhrase(current.wakePhrase ?? 'Hey LifeOS');
  }, [current, profileQuery.isError]);

  const applyCurrent = (): void => {
    if (!current) {
      return;
    }
    setDraftModel(current.model);
    setDraftHost(current.ollamaHost);
    setDraftNats(current.natsUrl);
    setVoiceEnabled(current.voiceEnabled);
    setLocalOnlyMode(current.localOnlyMode);
    setCloudAssistEnabled(current.cloudAssistEnabled);
    setTrustAuditEnabled(current.trustAuditEnabled);
    setTransparencyTipsEnabled(current.transparencyTipsEnabled);
    hasHydrated.current = true;
    lastHydratedSignature.current = JSON.stringify(current);
    setHasUnsavedChanges(false);
  };

  const applyProfileCurrent = (): void => {
    if (profileQuery.data) {
      setDraftAssistantName(profileQuery.data.assistantName ?? 'LifeOS');
      setDraftAvatarEmoji(profileQuery.data.avatarEmoji ?? '🤖');
      setDraftWakePhrase(profileQuery.data.wakePhrase ?? 'Hey LifeOS');
      setDraftAssistantTone((profileQuery.data.assistantTone ?? 'concise') as AssistantTone);
      setDraftUseCases(profileQuery.data.useCases ?? []);
      setProfileSaveStatus('idle');
      return;
    }

    if (current) {
      setDraftAssistantName(current.assistantName ?? 'LifeOS');
      setDraftWakePhrase(current.wakePhrase ?? 'Hey LifeOS');
      setDraftAvatarEmoji('🤖');
      setDraftAssistantTone('concise');
      setDraftUseCases([]);
      setProfileSaveStatus('idle');
    }
  };

  const markDirty = (): void => {
    if (saveMutation.isSuccess || saveMutation.isError) {
      saveMutation.reset();
    }
    setHasUnsavedChanges(true);
  };

  if (settingsQuery.isLoading) {
    return <Spinner label="Loading settings..." />;
  }

  if (settingsQuery.error || !current) {
    return <ErrorBanner message="Unable to load settings." />;
  }

  const liveModels = modelsQuery.data ?? [];
  const hasLiveModels = liveModels.length > 0;
  const currentModelMissing = hasLiveModels && !liveModels.includes(current.model);
  const modelSelectValue = modelsQuery.isLoading ? '__loading__' : hasLiveModels ? draftModel : '__unreachable__';
  const modelSelectDisabled = modelsQuery.isLoading || !hasLiveModels;
  const saveButtonDisabled = saveMutation.isPending || !hasUnsavedChanges;
  const saveStatus = saveMutation.isPending
    ? 'Saving settings...'
    : saveMutation.isSuccess
      ? 'Settings saved.'
      : null;

  const toggleUseCase = (label: string): void => {
    setProfileSaveStatus('idle');
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

  const getProfileDraftPayload = (): Partial<AssistantProfile> => ({
    assistantName: draftAssistantName.trim() || 'LifeOS',
    avatarEmoji: draftAvatarEmoji.trim() || '🤖',
    wakePhrase: draftWakePhrase.trim() || 'Hey LifeOS',
    assistantTone: draftAssistantTone,
    useCases: draftUseCases,
  });

  return (
    <div className="settings-layout">
      <section className="settings-section">
        <h3>AI MODEL</h3>
        <p className="muted">
          Local-first by default. Your data stays yours, and methods remain inspectable.
        </p>
        <label htmlFor="settings-model">Model</label>
        <select
          id="settings-model"
          value={modelSelectValue}
          disabled={modelSelectDisabled}
          onChange={(event) => {
            setDraftModel(event.target.value);
            markDirty();
          }}
        >
          {modelsQuery.isLoading ? (
            <option value="__loading__" disabled>
              Loading models...
            </option>
          ) : hasLiveModels ? (
            <>
              {currentModelMissing ? (
                <option value={current.model}>{`⚠️ ${current.model} (saved, not installed)`}</option>
              ) : null}
              {liveModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </>
          ) : (
            <option value="__unreachable__" disabled>
              Ollama not reachable - check host
            </option>
          )}
        </select>

        <label htmlFor="settings-host">Ollama host</label>
        <input
          id="settings-host"
          value={draftHost}
          onChange={(event) => {
            setDraftHost(event.target.value);
            markDirty();
          }}
        />

        <label htmlFor="settings-nats">NATS URL</label>
        <input
          id="settings-nats"
          value={draftNats}
          onChange={(event) => {
            setDraftNats(event.target.value);
            markDirty();
          }}
        />

        <label className="row" htmlFor="settings-voice">
          Voice assistant
          <input
            id="settings-voice"
            type="checkbox"
            checked={voiceEnabled}
            onChange={(event) => {
              setVoiceEnabled(event.target.checked);
              markDirty();
            }}
          />
        </label>

        <section className="assistant-profile-card">
          <h3>ASSISTANT</h3>

          <div className="assistant-profile-summary">
            <div className="assistant-profile-avatar">{draftAvatarEmoji || '🤖'}</div>
            <div className="assistant-profile-copy">
              <strong>{draftAssistantName || 'LifeOS'}</strong>
              <span className="muted">Your personal assistant</span>
            </div>
          </div>

          <label htmlFor="settings-assistant-name">Assistant name</label>
          <input
            id="settings-assistant-name"
            value={draftAssistantName}
            maxLength={32}
            onChange={(event) => {
              setDraftAssistantName(event.target.value);
              setProfileSaveStatus('idle');
            }}
          />

          <label htmlFor="settings-avatar-emoji">Avatar emoji</label>
          <input
            id="settings-avatar-emoji"
            className="assistant-emoji-input"
            value={draftAvatarEmoji}
            maxLength={2}
            onChange={(event) => {
              setDraftAvatarEmoji(event.target.value);
              setProfileSaveStatus('idle');
            }}
          />

          <label htmlFor="settings-wake-phrase">Wake phrase</label>
          <input
            id="settings-wake-phrase"
            value={draftWakePhrase}
            maxLength={64}
            onChange={(event) => {
              setDraftWakePhrase(event.target.value);
              setProfileSaveStatus('idle');
            }}
          />
          <p className="muted">
            Stored for future always-listening support. Not active in push-to-talk mode.
          </p>

          <label>Assistant tone</label>
          <div className="assistant-tone-group" role="tablist" aria-label="Assistant tone">
            {ASSISTANT_TONES.map((tone) => (
              <button
                key={tone}
                type="button"
                className={`assistant-tone-btn${draftAssistantTone === tone ? ' active' : ''}`}
                onClick={() => {
                  setDraftAssistantTone(tone);
                  setProfileSaveStatus('idle');
                }}
              >
                {tone}
              </button>
            ))}
          </div>

          <label>Use cases</label>
          <div className="assistant-use-case-grid">
            {ASSISTANT_USE_CASE_OPTIONS.map((option) => {
              const selected = draftUseCases.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  className={`assistant-use-case-chip${selected ? ' active' : ''}`}
                  onClick={() => {
                    toggleUseCase(option);
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {profileSaveStatus === 'saved' ? (
            <p className="muted" role="status" aria-live="polite">
              Profile saved.
            </p>
          ) : null}
          {profileSaveStatus === 'error' ? <ErrorBanner message="Unable to save profile." /> : null}

          <div className="row gap-sm">
            <button
              className="primary-btn"
              type="button"
              disabled={profileSaveMutation.isPending}
              onClick={() => {
                setProfileSaveStatus('saving');
                void profileSaveMutation.mutateAsync(getProfileDraftPayload());
              }}
            >
              Save profile
            </button>
            <button className="secondary-btn" type="button" onClick={applyProfileCurrent}>
              Revert
            </button>
          </div>
        </section>

        <h3>OWNERSHIP & TRANSPARENCY</h3>

        <label className="row" htmlFor="settings-local-only">
          Local-only mode
          <input
            id="settings-local-only"
            type="checkbox"
            checked={localOnlyMode}
            onChange={(event) => {
              const next = event.target.checked;
              setLocalOnlyMode(next);
              if (next) {
                setCloudAssistEnabled(false);
              }
              markDirty();
            }}
          />
        </label>

        <label className="row" htmlFor="settings-cloud-assist">
          Cloud assist
          <input
            id="settings-cloud-assist"
            type="checkbox"
            checked={cloudAssistEnabled}
            disabled={localOnlyMode}
            onChange={(event) => {
              setCloudAssistEnabled(event.target.checked);
              markDirty();
            }}
          />
        </label>

        <label className="row" htmlFor="settings-trust-audit">
          Trust audit timeline
          <input
            id="settings-trust-audit"
            type="checkbox"
            checked={trustAuditEnabled}
            onChange={(event) => {
              setTrustAuditEnabled(event.target.checked);
              markDirty();
            }}
          />
        </label>

        <label className="row" htmlFor="settings-transparency-tips">
          Transparency tips
          <input
            id="settings-transparency-tips"
            type="checkbox"
            checked={transparencyTipsEnabled}
            onChange={(event) => {
              setTransparencyTipsEnabled(event.target.checked);
              markDirty();
            }}
          />
        </label>

        {saveMutation.isError ? <ErrorBanner message="Unable to save settings." /> : null}
        {saveStatus ? (
          <p className="muted" role="status" aria-live="polite">
            {saveStatus}
          </p>
        ) : null}

        <div className="row gap-sm">
          <button
            className="primary-btn"
            type="button"
            disabled={saveButtonDisabled}
            onClick={() => {
              void saveMutation.mutateAsync({
                model: draftModel,
                ollamaHost: draftHost,
                natsUrl: draftNats,
                voiceEnabled,
                localOnlyMode,
                cloudAssistEnabled: localOnlyMode ? false : cloudAssistEnabled,
                trustAuditEnabled,
                transparencyTipsEnabled,
              });
            }}
          >
            Save Settings
          </button>
          <button className="secondary-btn" type="button" onClick={applyCurrent}>
            Revert
          </button>
        </div>
      </section>

      <section className="settings-section">
        <TrustCenter />
      </section>
    </div>
  );
}
