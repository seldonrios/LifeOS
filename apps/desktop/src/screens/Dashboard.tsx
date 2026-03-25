import { useQuery } from '@tanstack/react-query';
import { completeTask, listTasks, getGraphSummary } from '../ipc';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Welcome back';
}

export function Dashboard(): JSX.Element {
  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: listTasks,
  });

  const graphQuery = useQuery({
    queryKey: ['graph-summary'],
    queryFn: getGraphSummary,
    staleTime: 10_000,
  });

  if (tasksQuery.isLoading) {
    return <Spinner label="Loading your dashboard..." />;
  }

  if (tasksQuery.error) {
    return <ErrorBanner message="Unable to load dashboard tasks." />;
  }

  const tasks = tasksQuery.data ?? [];
  const activeGoals = graphQuery.data?.activeGoals ?? [];
  const topTask = tasks[0];

  return (
    <div className="screen-grid">
      <section className="card card-wide">
        <h3>TODAY'S BRIEFING</h3>
        {tasks.length === 0 ? (
          <p>
            {getGreeting()}. Your workspace is ready. Use <strong>Goal Builder</strong> to create
            your first plan, or say <em>&ldquo;Plan my week&rdquo;</em> to get a transparent, step-by-step
            draft.
          </p>
        ) : (
          <p>
            {getGreeting()}. Top task: <strong>{topTask?.title ?? 'No urgent tasks'}</strong>. Mark
            tasks done as you go to keep your graph progress accurate and easy to trust.
          </p>
        )}
      </section>

      <section className="card">
        <h3>OPEN TASKS</h3>
        {tasks.length === 0 ? (
          <p className="muted">No open tasks yet. Generate a goal plan and tasks will appear here.</p>
        ) : null}
        {tasks.map((task) => (
          <div className="task-row" key={task.id}>
            <span>{task.title}</span>
            <div className="task-actions">
              {task.dueDate ? <span className="due-badge">{task.dueDate}</span> : null}
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  void completeTask(task.id).then(() => tasksQuery.refetch());
                }}
              >
                Mark done
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>ACTIVE FOCUS</h3>
        {activeGoals.length === 0 ? (
          <p className="muted">No active goals yet. Build your first plan in Goal Builder.</p>
        ) : (
          activeGoals.map((goal) => (
            <div className="task-row" key={goal.id}>
              <span>{goal.title ?? goal.id}</span>
              <span className="muted">
                {goal.completedTasks ?? 0}/{goal.totalTasks ?? 0} done
              </span>
            </div>
          ))
        )}
      </section>

      <button className="voice-btn" type="button">
        Talk to LifeOS for a guided walkthrough
      </button>
    </div>
  );
}
