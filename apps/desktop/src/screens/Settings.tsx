import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { readSettings, writeSettings } from '../ipc';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

export function Settings(): JSX.Element {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: readSettings,
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
    onSuccess: () => {
      setHasUnsavedChanges(false);
      void settingsQuery.refetch();
    },
  });

  const current = settingsQuery.data;

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

  if (settingsQuery.isLoading) {
    return <Spinner label="Loading settings..." />;
  }

  if (settingsQuery.error || !current) {
    return <ErrorBanner message="Unable to load settings." />;
  }

  return (
    <div className="settings-layout">
      <section className="settings-section">
        <h3>AI MODEL</h3>
        <label htmlFor="settings-model">Model</label>
        <select
          id="settings-model"
          value={draftModel}
          onChange={(event) => {
            setDraftModel(event.target.value);
            setHasUnsavedChanges(true);
          }}
        >
          <option value="llama3.1:8b">llama3.1:8b</option>
          <option value="mistral:7b">mistral:7b</option>
        </select>

        <label htmlFor="settings-host">Ollama host</label>
        <input
          id="settings-host"
          value={draftHost}
          onChange={(event) => {
            setDraftHost(event.target.value);
            setHasUnsavedChanges(true);
          }}
        />

        <label htmlFor="settings-nats">NATS URL</label>
        <input
          id="settings-nats"
          value={draftNats}
          onChange={(event) => {
            setDraftNats(event.target.value);
            setHasUnsavedChanges(true);
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
              setHasUnsavedChanges(true);
            }}
          />
        </label>

        <div className="row gap-sm">
          <button
            className="primary-btn"
            type="button"
            disabled={saveMutation.isPending}
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
