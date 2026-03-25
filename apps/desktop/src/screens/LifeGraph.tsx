import { useState } from 'react';
import { useGraph } from '../hooks/useGraph';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

export function LifeGraph(): JSX.Element {
  const graphQuery = useGraph();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (graphQuery.isLoading) {
    return <Spinner label="Rendering graph..." />;
  }

  if (graphQuery.error) {
    return <ErrorBanner message="Unable to load graph summary." />;
  }

  const activeGoals = graphQuery.data?.activeGoals ?? [];
  const selectedGoal = activeGoals.find((g) => g.id === selectedId) ?? null;

  return (
    <div className="split-layout">
      <section className="graph-canvas">
        <div className="graph-legend">
          <span className="tag">Goals</span>
          <span className="tag">Tasks</span>
          <span className="tag">Notes</span>
        </div>

        {activeGoals.length === 0 ? <p className="muted">No active goals in your graph.</p> : null}

        {activeGoals.map((goal, index) => (
          <div
            key={goal.id}
            className={`goal-node${selectedId === goal.id ? ' goal-node--selected' : ''}`}
            style={{ left: `${20 + index * 28}%`, top: `${28 + (index % 2) * 24}%` }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === goal.id}
            onClick={() => setSelectedId(goal.id === selectedId ? null : goal.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(goal.id === selectedId ? null : goal.id); }}
          >
            <strong>{goal.title ?? goal.id}</strong>
            <span>
              {goal.completedTasks ?? 0}/{goal.totalTasks ?? 0} complete
            </span>
          </div>
        ))}
      </section>

      <aside className="detail-panel">
        <h3>Graph Snapshot</h3>
        <p>
          Goals: <strong>{graphQuery.data?.totalGoals ?? 0}</strong>
        </p>
        <p>
          Plans: <strong>{graphQuery.data?.totalPlans ?? 0}</strong>
        </p>
        {selectedGoal ? (
          <div className="node-detail">
            <h4>{selectedGoal.title ?? selectedGoal.id}</h4>
            <p>
              Progress: <strong>{selectedGoal.completedTasks ?? 0}</strong> /{' '}
              <strong>{selectedGoal.totalTasks ?? 0}</strong> tasks complete
            </p>
            <div
              className="progress-bar-track"
              role="progressbar"
              aria-valuenow={selectedGoal.completedTasks ?? 0}
              aria-valuemax={selectedGoal.totalTasks ?? 1}
            >
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.round(((selectedGoal.completedTasks ?? 0) / Math.max(selectedGoal.totalTasks ?? 1, 1)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="muted">Click a node to inspect goal progress and metadata.</p>
        )}
      </aside>
    </div>
  );
}
