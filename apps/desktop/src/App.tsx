import { useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Dashboard } from './screens/Dashboard';
import { LifeGraph } from './screens/LifeGraph';
import { GoalBuilder } from './screens/GoalBuilder';
import { Marketplace } from './screens/Marketplace';
import { Settings } from './screens/Settings';
import { useGraph } from './hooks/useGraph';
import { useModules } from './hooks/useModules';
import type { ScreenId } from './types';

const SCREEN_META: Record<ScreenId, { title: string }> = {
  dashboard: { title: 'Good morning' },
  graph: { title: 'Life Graph' },
  goals: { title: 'Goal Builder' },
  marketplace: { title: 'Marketplace' },
  settings: { title: 'Settings' },
};

export function App(): JSX.Element {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
  const graphQuery = useGraph();
  const { modulesQuery } = useModules();

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

  return (
    <div className="app-shell">
      <Sidebar active={activeScreen} onSelect={setActiveScreen} />
      <div className="main-shell">
        <header className="topbar">
          <h1>{SCREEN_META[activeScreen].title}</h1>
          <span className="status-pill">Runtime online</span>
        </header>

        <main className="screen-area">{renderScreen(activeScreen)}</main>

        <StatusBar model="llama3.1:8b" graphSummary={graphSummary} modulesSummary={modulesSummary} />
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
