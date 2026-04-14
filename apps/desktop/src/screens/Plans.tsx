import { useMemo, useState } from 'react';
import type { GoalSummary } from '@lifeos/contracts';
import { useQuery } from '@tanstack/react-query';
import { useGoal } from '../hooks/useGoal';
import { listGoals, readSettings } from '../ipc';

type PlanTab = 'active' | 'waiting' | 'done' | 'stalled';

function toLocalDayKey(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseDeadlineToLocalDayKey(deadline: string): number | null {
  const dateOnlyMatch = deadline.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const localDate = new Date(year, month - 1, day);
    return Number.isFinite(localDate.getTime()) ? toLocalDayKey(localDate) : null;
  }

  const parsed = new Date(deadline);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return toLocalDayKey(parsed);
}

export function isPlanActiveForDate(plan: GoalSummary, referenceTime = new Date()): boolean {
  const notDone = plan.completedTasks < plan.totalTasks;
  if (!notDone) {
    return false;
  }

  if (plan.deadline === null) {
    return true;
  }

  const deadlineDayKey = parseDeadlineToLocalDayKey(plan.deadline);
  if (deadlineDayKey === null) {
    return true;
  }

  return deadlineDayKey >= toLocalDayKey(referenceTime);
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return '';
  const d = new Date(deadline);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface PlanItemProps {
  plan: GoalSummary;
  isActive: boolean;
  onClick: () => void;
}

function PlanItem({ plan, isActive, onClick }: PlanItemProps): JSX.Element {
  const deadlineStr = formatDeadline(plan.deadline);
  const meta = `${plan.completedTasks} of ${plan.totalTasks} steps done${deadlineStr ? ` · Due ${deadlineStr}` : ''}`;
  return (
    <div
      className={`plan-item${isActive ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <p className="plan-name">{plan.title}</p>
      <p className="plan-meta">{meta}</p>
    </div>
  );
}

export function Plans(): JSX.Element {
  const [activeTab, setActiveTab] = useState<PlanTab>('active');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const goalsQuery = useQuery({ queryKey: ['goals'], queryFn: listGoals });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: readSettings, staleTime: 30_000 });
  const goalMutation = useGoal();

  const model = settingsQuery.data?.model ?? 'llama3.1:8b';
  const allGoals = goalsQuery.data ?? [];

  const filteredPlans = useMemo((): GoalSummary[] => {
    if (activeTab === 'active') {
      return allGoals.filter((p) => isPlanActiveForDate(p, new Date()));
    }
    return [];
  }, [activeTab, allGoals]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedPlanId && filteredPlans.some((p) => p.id === selectedPlanId)) {
      return selectedPlanId;
    }
    return filteredPlans.length > 0 ? filteredPlans[0].id : null;
  }, [selectedPlanId, filteredPlans]);

  const selectedPlan = filteredPlans.find((p) => p.id === effectiveSelectedId) ?? null;

  const tabs: { id: PlanTab; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'done', label: 'Done' },
    { id: 'stalled', label: 'Stalled' },
  ];

  if (goalsQuery.isError) {
    return (
      <section className="card card-wide">
        <p>LifeOS couldn't load your plans right now. You can still capture items and check back shortly.</p>
        <button
          className="primary-btn"
          type="button"
          onClick={() => { void goalsQuery.refetch(); }}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="plans-layout">
      {/* List pane */}
      <div className="plans-list-pane">
        <h2 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Plans</h2>
        <div className="tab-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedPlanId(null);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {goalsQuery.isLoading ? (
          <p className="muted" style={{ fontSize: '13px' }}>Loading…</p>
        ) : (
          filteredPlans.map((plan) => (
            <PlanItem
              key={plan.id}
              plan={plan}
              isActive={plan.id === effectiveSelectedId}
              onClick={() => setSelectedPlanId(plan.id)}
            />
          ))
        )}
      </div>

      {/* Detail pane */}
      <div className="plans-detail-pane">
        {filteredPlans.length === 0 && !goalsQuery.isLoading ? (
          <section className="card card-wide empty-state">
            <h3>No active plans yet.</h3>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                className="primary-btn"
                type="button"
                onClick={() => { console.log('Coming soon: Turn a task into a plan'); }}
              >
                Turn a task into a plan
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => { console.log('Coming soon: Start with a goal'); }}
              >
                Start with a goal
              </button>
            </div>
          </section>
        ) : selectedPlan ? (
          <>
            <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>{selectedPlan.title}</h2>
            <p className="muted" style={{ marginBottom: '24px' }}>Why it matters: —</p>

            <p className="section-label">NEXT ACTIONS</p>
            {goalMutation.data && goalMutation.data.title === selectedPlan.title ? (
              <div>
                {(goalMutation.data.tasks ?? []).map((task, i) => (
                  <div className="step-row" key={`${task.title}-${i}`}>
                    <span className="step-num">{i + 1}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: '13px' }}>{task.title}</p>
                      {task.dueDate ? (
                        <small className="muted">Due {task.dueDate}</small>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="step-row">
                <span className="step-num">—</span>
                <p style={{ margin: 0, fontSize: '13px' }} className="muted">
                  Run "Generate steps" to see next actions.
                </p>
              </div>
            )}

            <p className="section-label" style={{ marginTop: '24px' }}>BLOCKERS</p>
            <p className="muted" style={{ fontSize: '13px' }}>None</p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '24px' }}>
              <button
                className="primary-btn"
                type="button"
                disabled={goalMutation.isPending}
                onClick={() => {
                  void goalMutation.mutateAsync({ goal: selectedPlan.title, model });
                }}
              >
                {goalMutation.isPending ? 'Generating…' : 'Generate steps'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => { console.log('Coming soon: Reorder'); }}
              >
                Reorder
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => { console.log('Coming soon: Mark blocked'); }}
              >
                Mark blocked
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => { console.log('Coming soon: Request alternatives'); }}
              >
                Request alternatives
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => { console.log('Coming soon: Split into smaller actions'); }}
              >
                Split into smaller actions
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
