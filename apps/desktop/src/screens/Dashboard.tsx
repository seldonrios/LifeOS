import { useQuery } from '@tanstack/react-query';
import { completeTask, listTasks } from '../ipc';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

export function Dashboard(): JSX.Element {
  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: listTasks,
  });

  if (tasksQuery.isLoading) {
    return <Spinner label="Loading your dashboard..." />;
  }

  if (tasksQuery.error) {
    return <ErrorBanner message="Unable to load dashboard tasks." />;
  }

  const tasks = tasksQuery.data ?? [];

  return (
    <div className="screen-grid">
      <section className="card card-wide">
        <h3>TODAY'S BRIEFING</h3>
        <p>
          Good morning. Top task: {tasks[0]?.title ?? 'No urgent tasks yet'}. Stay focused and keep
          momentum with your active goals.
        </p>
      </section>

      <section className="card">
        <h3>OPEN TASKS</h3>
        {tasks.length === 0 ? <p>No open tasks.</p> : null}
        {tasks.map((task) => (
          <div className="task-row" key={task.id}>
            <span>{task.title}</span>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => {
                void completeTask(task.id).then(() => tasksQuery.refetch());
              }}
            >
              {task.dueDate ?? 'Mark done'}
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>ACTIVE FOCUS</h3>
        <div className="task-row">
          <span>Board meeting prep</span>
          <span>2/5 done</span>
        </div>
        <div className="task-row">
          <span>Q1 planning</span>
          <span>0/3 done</span>
        </div>
      </section>

      <button className="voice-btn" type="button">
        Talk to LifeOS
      </button>
    </div>
  );
}
