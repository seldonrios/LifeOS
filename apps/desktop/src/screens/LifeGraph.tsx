import { useGraph } from '../hooks/useGraph';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

export function LifeGraph(): JSX.Element {
  const graphQuery = useGraph();

  if (graphQuery.isLoading) {
    return <Spinner label="Rendering graph..." />;
  }

  if (graphQuery.error) {
    return <ErrorBanner message="Unable to load graph summary." />;
  }

  const activeGoals = graphQuery.data?.activeGoals ?? [];

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
            className="goal-node"
            style={{ left: `${20 + index * 28}%`, top: `${28 + (index % 2) * 24}%` }}
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
        <p className="muted">Select a node to inspect relationships and metadata.</p>
      </aside>
    </div>
  );
}
