import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QuickCaptureOverlay } from './components/QuickCaptureOverlay';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TrustIndicator } from './components/TrustIndicator';
import { Today } from './screens/Today';
import { Plans } from './screens/Plans';
import { Inbox } from './screens/Inbox';
import { Review } from './screens/Review';
import { Memory } from './screens/Memory';
import { Integrations } from './screens/Integrations';
import { Settings } from './screens/Settings';
import { useGraph } from './hooks/useGraph';
import { useModules } from './hooks/useModules';
import { readSettings } from './ipc';
import type { ScreenId } from './types';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Welcome back';
}

function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const SCREEN_META: Record<ScreenId, { title: string }> = {
  today: { title: 'Today' },
  inbox: { title: 'Inbox' },
  plans: { title: 'Plans' },
  review: { title: 'Review' },
  memory: { title: 'Memory' },
  integrations: { title: 'Integrations' },
  settings: { title: 'Settings' },
};

function getLastSyncLabel(updatedAt?: string): string {
  if (!updatedAt) return 'just now';
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000);
  if (diff < 1) return 'just now';
  return `${diff} min ago`;
}

export function App(): JSX.Element {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('today');
  const [captureOpen, setCaptureOpen] = useState(false);
  const graphQuery = useGraph();
  const { modulesQuery } = useModules();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: readSettings, staleTime: 30_000 });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCaptureOpen(true);
      }
      if (event.key === 'Escape' && captureOpen) {
        setCaptureOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [captureOpen]);

  const screenTitle = useMemo(() => {
    if (activeScreen === 'today') return getTimeGreeting();
    return SCREEN_META[activeScreen].title;
  }, [activeScreen]);

  const graphSummary = useMemo(() => {
    if (!graphQuery.data) {
      return 'Graph: loading';
    }
    return `Graph: ${graphQuery.data.totalGoals} goals · ${graphQuery.data.totalPlans} plans`;
  }, [graphQuery.data]);

  const modulesSummary = useMemo(() => {
    if (!modulesQuery.data) {
      return 'Modules: loading';
    }
    const enabled = modulesQuery.data.filter((item) => item.enabled).map((item) => item.id);
    return `Modules: ${enabled.slice(0, 3).join(', ') || 'none'}`;
  }, [modulesQuery.data]);

  const activeModel = settingsQuery.data?.model ?? 'llama3.1:8b';
  const localOnlyMode = settingsQuery.data?.localOnlyMode ?? true;
  const connectedServices = modulesQuery.data?.filter((module) => module.enabled).length ?? 0;
  const lastSyncLabel = getLastSyncLabel(graphQuery.data?.updatedAt);
  const runtimeMode = isDesktopRuntime() ? 'Desktop runtime' : 'Preview mode';
  const runtimeHint = isDesktopRuntime()
    ? 'Connected to your local services and user-owned data.'
    : 'Showing safe preview data until desktop services are available.';
  const runtimeStatus = graphQuery.isLoading || modulesQuery.isLoading || settingsQuery.isLoading
    ? 'Syncing workspace data'
    : 'Workspace data ready';

  return (
    <div className="app-shell">
      <Sidebar active={activeScreen} onSelect={setActiveScreen} />
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-copy">
            <h1>{screenTitle}</h1>
            <p className="topbar-subtitle">
              {runtimeMode}. {runtimeHint}
            </p>
          </div>
          <div className="row gap-sm">
            <button type="button" className="ghost-btn" onClick={() => setCaptureOpen(true)}>
              + Capture
            </button>
            <span className="status-pill" title={runtimeHint}>
              {runtimeStatus}
            </span>
          </div>
        </header>

        <TrustIndicator
          localOnlyMode={localOnlyMode}
          connectedServices={connectedServices}
          lastSyncLabel={lastSyncLabel}
        />

        <main className="screen-area">{renderScreen(activeScreen, setActiveScreen)}</main>

        <StatusBar model={activeModel} graphSummary={graphSummary} modulesSummary={modulesSummary} />
      </div>

      <QuickCaptureOverlay open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  );
}

function renderScreen(screen: ScreenId, onNavigate: (screen: ScreenId) => void): JSX.Element {
  if (screen === 'today') {
    return <Today onNavigate={onNavigate} />;
  }
  if (screen === 'inbox') {
    return <Inbox />;
  }
  if (screen === 'plans') {
    return <Plans />;
  }
  if (screen === 'review') {
    return <Review />;
  }
  if (screen === 'memory') {
    return <Memory />;
  }
  if (screen === 'integrations') {
    return <Integrations />;
  }
  return <Settings />;
}
