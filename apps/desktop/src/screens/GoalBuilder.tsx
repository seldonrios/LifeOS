import { useState } from 'react';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { useGoal } from '../hooks/useGoal';

export function GoalBuilder(): JSX.Element {
  const [goal, setGoal] = useState('Prepare for the quarterly board meeting next Thursday');
  const [model, setModel] = useState('llama3.1:8b');
  const goalMutation = useGoal();

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
        />

        <label htmlFor="model-select">Model</label>
        <select id="model-select" value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="llama3.1:8b">llama3.1:8b</option>
          <option value="mistral:7b">mistral:7b</option>
        </select>

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
                      Due {task.dueDate ?? 'TBD'} • Priority {task.priority ?? 3}
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
