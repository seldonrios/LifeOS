import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listOllamaModels, readSettings, writeSettings } from '../ipc';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

export function Settings(): JSX.Element {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: readSettings,
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
  const [voiceEnabled, setVoiceEnabled] = useState(true);
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
    hasHydrated.current = true;
    lastHydratedSignature.current = currentSignature;
    setHasUnsavedChanges(false);
  }, [current, hasUnsavedChanges]);

  const applyCurrent = (): void => {
    if (!current) {
      return;
    }
    setDraftModel(current.model);
    setDraftHost(current.ollamaHost);
    setDraftNats(current.natsUrl);
    setVoiceEnabled(current.voiceEnabled);
    hasHydrated.current = true;
    lastHydratedSignature.current = JSON.stringify(current);
    setHasUnsavedChanges(false);
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

  return (
    <div className="settings-layout">
      <section className="settings-section">
        <h3>AI MODEL</h3>
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
    </div>
  );
}
