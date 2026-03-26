import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { useGoal } from '../hooks/useGoal';
import { readSettings } from '../ipc';

export function GoalBuilder(): JSX.Element {
  const [goal, setGoal] = useState('');
  const goalMutation = useGoal();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: readSettings, staleTime: 30_000 });
  const model = settingsQuery.data?.model ?? 'llama3.1:8b';

  const plan = goalMutation.data;

  return (
    <div className="builder-layout">
      <section className="builder-input">
        <label htmlFor="goal-input">Describe your goal</label>
        <textarea
          id="goal-input"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          rows={6}
          placeholder="e.g. Plan my week, Prepare for next month's review, Get fit by summer..."
        />

        <p className="muted" style={{ fontSize: '12px', margin: 0 }}>
          Model: <strong>{model}</strong> - local-first by default, change in Settings
        </p>

        <button
          className="primary-btn"
          type="button"
          onClick={() => {
            void goalMutation.mutateAsync({ goal, model });
          }}
          disabled={goalMutation.isPending || goal.trim().length === 0}
        >
          Generate Plan
        </button>
      </section>

      <section className="builder-preview">
        <h3>PLAN PREVIEW</h3>
        {goalMutation.isPending ? <Spinner label="Generating goal plan..." /> : null}
        {goalMutation.error ? <ErrorBanner message="Goal generation failed." /> : null}

        {!goalMutation.isPending && !goalMutation.error && !plan ? (
          <div className="empty-state">
            <p className="muted">
              Describe a goal on the left and press <strong>Generate Plan</strong> to get a
              step-by-step action plan tailored by your personal AI with transparent methods.
            </p>
          </div>
        ) : null}

        {!goalMutation.isPending && !goalMutation.error && plan ? (
          <>
            <h4>{plan.title ?? 'Generated Plan'}</h4>
            <p className="muted">{plan.summary ?? 'No summary available.'}</p>
            <div className="task-list">
              {(plan.tasks ?? []).map((task, index) => (
                <div className="task-item" key={`${task.title}-${index}`}>
                  <span className="task-index">{index + 1}</span>
                  <div>
                    <p>{task.title}</p>
                    <small>
                      Due {task.dueDate ?? 'TBD'} - Priority {task.priority ?? 3}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
