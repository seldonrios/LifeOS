import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Dashboard } from './screens/Dashboard';
import { LifeGraph } from './screens/LifeGraph';
import { GoalBuilder } from './screens/GoalBuilder';
import { Marketplace } from './screens/Marketplace';
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
  dashboard: { title: 'Dashboard' },
  graph: { title: 'Life Graph' },
  goals: { title: 'Goal Builder' },
  marketplace: { title: 'Marketplace' },
  settings: { title: 'Settings' },
};

export function App(): JSX.Element {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
  const graphQuery = useGraph();
  const { modulesQuery } = useModules();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: readSettings, staleTime: 30_000 });

  const screenTitle = useMemo(() => {
    if (activeScreen === 'dashboard') return getTimeGreeting();
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
  const runtimeMode = isDesktopRuntime() ? 'Desktop runtime' : 'Preview mode';
  const runtimeHint = isDesktopRuntime()
    ? 'Connected to your local services and data.'
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
          <span className="status-pill" title={runtimeHint}>
            {runtimeStatus}
          </span>
        </header>

        <main className="screen-area">{renderScreen(activeScreen)}</main>

        <StatusBar model={activeModel} graphSummary={graphSummary} modulesSummary={modulesSummary} />
      </div>
    </div>
  );
}

function renderScreen(screen: ScreenId): JSX.Element {
  if (screen === 'dashboard') {
    return <Dashboard />;
  }
  if (screen === 'graph') {
    return <LifeGraph />;
  }
  if (screen === 'goals') {
    return <GoalBuilder />;
  }
  if (screen === 'marketplace') {
    return <Marketplace />;
  }
  return <Settings />;
}
