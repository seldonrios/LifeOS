import { useEffect, useMemo, useState } from 'react';
import type { GoalSummary } from '@lifeos/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FeatureTour } from '../components/FeatureTour';
import { useGoal } from '../hooks/useGoal';
import { usePageTour } from '../hooks/usePageTour';
import { listGoals, markPlanBlocked, readSettings, requestPlanAlternatives, splitPlan } from '../ipc';
import { plansTourSteps } from '../tours';
import type { ScreenId } from '../types';

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
  isBlocked: boolean;
  onClick: () => void;
}

function PlanItem({ plan, isActive, isBlocked, onClick }: PlanItemProps): JSX.Element {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <p className="plan-name" style={{ margin: 0 }}>{plan.title}</p>
        {isBlocked ? <span className="badge warn">Blocked</span> : null}
      </div>
      <p className="plan-meta">{meta}</p>
    </div>
  );
}

interface Props {
  onNavigate: (screen: ScreenId) => void;
  onResetTour?: (resetTour: (() => void) | null) => void;
}

export function Plans({ onNavigate, onResetTour }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<PlanTab>('active');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [planAlternativesMap, setPlanAlternativesMap] = useState<Record<string, string[]>>({});
  const [planSubPlansMap, setPlanSubPlansMap] = useState<Record<string, Array<{ id: string; title: string }>>>({});
  const [blockedPlanIds, setBlockedPlanIds] = useState<Set<string>>(new Set());
  const [blockerReason, setBlockerReason] = useState('');
  const queryClient = useQueryClient();

  const goalsQuery = useQuery({ queryKey: ['goals'], queryFn: listGoals });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: readSettings, staleTime: 30_000 });
  const goalMutation = useGoal();
  const hasTourData = (goalsQuery.data ?? []).some((plan) => isPlanActiveForDate(plan, new Date()));
  const { tourActive, currentStep, advance, dismiss, reset } = usePageTour(
    'plans',
    !goalsQuery.isLoading && !goalsQuery.isError && hasTourData,
  );

  const model = settingsQuery.data?.model ?? 'llama3.1:8b';
  const allGoals = goalsQuery.data ?? [];

  const setTransientMessage = (message: string): void => {
    setActionMessage(message);
    setTimeout(() => setActionMessage(null), 2_000);
  };

  const markBlockedMutation = useMutation({
    mutationFn: ({ planId, reason }: { planId: string; reason: string }) => markPlanBlocked(planId, reason),
    onSuccess: (_data, variables) => {
      setBlockedPlanIds((current) => {
        const next = new Set(current);
        next.add(variables.planId);
        return next;
      });
      setActionError(null);
      setTransientMessage('Plan marked blocked ✓');
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: () => {
      setActionError("LifeOS couldn't mark this plan blocked right now.");
    },
  });

  const requestAlternativesMutation = useMutation({
    mutationFn: (planId: string) => requestPlanAlternatives(planId),
    onSuccess: (data, planId) => {
      setPlanAlternativesMap((current) => ({ ...current, [planId]: data.alternatives }));
      setActionError(null);
      setTransientMessage('Alternatives ready ✓');
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: () => {
      setActionError("LifeOS couldn't request alternatives right now.");
    },
  });

  const splitPlanMutation = useMutation({
    mutationFn: (planId: string) => splitPlan(planId),
    onSuccess: (data, planId) => {
      setPlanSubPlansMap((current) => ({ ...current, [planId]: data.subPlans }));
      setActionError(null);
      setTransientMessage('Sub-plans created ✓');
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: () => {
      setActionError("LifeOS couldn't split this plan right now.");
    },
  });

  const filteredPlans = useMemo((): GoalSummary[] => {
    if (activeTab === 'active') {
      return allGoals.filter((p) => isPlanActiveForDate(p, new Date()));
    }
    if (activeTab === 'waiting') {
      return allGoals.filter(
        (p) =>
          p.completedTasks === 0 &&
          Boolean(p.deadline) &&
          parseDeadlineToLocalDayKey(p.deadline as string) !== null &&
          (parseDeadlineToLocalDayKey(p.deadline as string) as number) >= toLocalDayKey(new Date()),
      );
    }
    if (activeTab === 'done') {
      return allGoals.filter((p) => p.completedTasks === p.totalTasks && p.totalTasks > 0);
    }
    if (activeTab === 'stalled') {
      return allGoals.filter(
        (p) =>
          p.completedTasks > 0 &&
          p.completedTasks < p.totalTasks &&
          Boolean(p.deadline) &&
          parseDeadlineToLocalDayKey(p.deadline as string) !== null &&
          (parseDeadlineToLocalDayKey(p.deadline as string) as number) < toLocalDayKey(new Date()),
      );
    }
    return allGoals;
  }, [activeTab, allGoals]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedPlanId && filteredPlans.some((p) => p.id === selectedPlanId)) {
      return selectedPlanId;
    }
    return filteredPlans.length > 0 ? filteredPlans[0].id : null;
  }, [selectedPlanId, filteredPlans]);

  const selectedPlan = filteredPlans.find((p) => p.id === effectiveSelectedId) ?? null;
  const isSelectedBlocked = effectiveSelectedId ? blockedPlanIds.has(effectiveSelectedId) : false;
  const selectedAlternatives = effectiveSelectedId ? (planAlternativesMap[effectiveSelectedId] ?? null) : null;
  const selectedSubPlans = effectiveSelectedId ? (planSubPlansMap[effectiveSelectedId] ?? null) : null;

  const tabs: { id: PlanTab; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'done', label: 'Done' },
    { id: 'stalled', label: 'Stalled' },
  ];

  useEffect(() => {
    onResetTour?.(reset);
    return () => onResetTour?.(null);
  }, [onResetTour, reset]);

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
      <div
        className="plans-list-pane"
        id="plans-list-pane"
        aria-describedby={tourActive && currentStep === 0 ? `coachmark-${currentStep + 1}` : undefined}
      >
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
              isBlocked={blockedPlanIds.has(plan.id)}
              onClick={() => setSelectedPlanId(plan.id)}
            />
          ))
        )}
      </div>

      {/* Detail pane */}
      <div className="plans-detail-pane">
        {actionMessage ? (
          <section className="card card-wide">
            <p style={{ margin: 0 }}>{actionMessage}</p>
          </section>
        ) : null}

        {actionError ? (
          <section className="card card-wide">
            <p style={{ margin: 0 }}>{actionError}</p>
          </section>
        ) : null}

        {filteredPlans.length === 0 && !goalsQuery.isLoading ? (
          <section className="card card-wide empty-state">
            <h3>No active plans yet.</h3>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                id="plans-generate-btn"
                className="primary-btn"
                type="button"
                disabled
                aria-describedby={tourActive && currentStep === 1 ? `coachmark-${currentStep + 1}` : undefined}
              >
                Generate steps
              </button>
              <button
                id="plans-blocked-btn"
                className="ghost-btn"
                type="button"
                disabled
                aria-describedby={tourActive && currentStep === 2 ? `coachmark-${currentStep + 1}` : undefined}
              >
                Mark blocked
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  onNavigate('inbox');
                }}
              >
                Turn a task into a plan
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled
                title="Start with a goal coming soon"
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
            {isSelectedBlocked ? (
              <div className="item-row" style={{ marginBottom: '10px' }}>
                <span className="badge warn">Blocked</span>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '13px', marginTop: 0 }}>None</p>
            )}

            <div style={{ marginTop: '8px' }}>
              <label htmlFor="plan-blocker-reason" className="muted" style={{ display: 'block', marginBottom: '6px' }}>
                Reason (optional)
              </label>
              <input
                id="plan-blocker-reason"
                value={blockerReason}
                onChange={(e) => setBlockerReason(e.target.value)}
                placeholder="Waiting on dependency, approval, etc."
                style={{ width: '100%', maxWidth: '420px' }}
              />
            </div>

            <p className="section-label" style={{ marginTop: '24px' }}>ALTERNATIVES</p>
            {selectedAlternatives && selectedAlternatives.length > 0 ? (
              selectedAlternatives.map((alternative) => (
                <div className="item-row" key={alternative}>
                  <span>{alternative}</span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ fontSize: '13px' }}>No alternatives requested yet.</p>
            )}

            <p className="section-label" style={{ marginTop: '24px' }}>SUB-PLANS</p>
            {selectedSubPlans && selectedSubPlans.length > 0 ? (
              selectedSubPlans.map((subPlan) => (
                <div className="item-row" key={subPlan.id}>
                  <span>{subPlan.title}</span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ fontSize: '13px' }}>No sub-plans generated yet.</p>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '24px' }}>
              <button
                id="plans-generate-btn"
                className="primary-btn"
                type="button"
                disabled={goalMutation.isPending}
                aria-describedby={tourActive && currentStep === 1 ? `coachmark-${currentStep + 1}` : undefined}
                onClick={() => {
                  void goalMutation.mutateAsync({ goal: selectedPlan.title, model });
                }}
              >
                {goalMutation.isPending ? 'Generating…' : 'Generate steps'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled
                title="Reorder coming soon"
              >
                Reorder
              </button>
              <button
                id="plans-blocked-btn"
                className="ghost-btn"
                type="button"
                disabled={markBlockedMutation.isPending || !effectiveSelectedId}
                aria-describedby={tourActive && currentStep === 2 ? `coachmark-${currentStep + 1}` : undefined}
                onClick={() => {
                  if (!effectiveSelectedId) {
                    return;
                  }
                  setActionError(null);
                  void markBlockedMutation.mutateAsync({ planId: effectiveSelectedId, reason: blockerReason });
                }}
              >
                {markBlockedMutation.isPending ? 'Marking…' : 'Mark blocked'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={requestAlternativesMutation.isPending || !effectiveSelectedId}
                onClick={() => {
                  if (!effectiveSelectedId) {
                    return;
                  }
                  setActionError(null);
                  void requestAlternativesMutation.mutateAsync(effectiveSelectedId);
                }}
              >
                {requestAlternativesMutation.isPending ? 'Requesting…' : 'Request alternatives'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={splitPlanMutation.isPending || !effectiveSelectedId}
                onClick={() => {
                  if (!effectiveSelectedId) {
                    return;
                  }
                  setActionError(null);
                  void splitPlanMutation.mutateAsync(effectiveSelectedId);
                }}
              >
                {splitPlanMutation.isPending ? 'Splitting…' : 'Split into smaller actions'}
              </button>
            </div>
          </>
        ) : null}
        <FeatureTour
          steps={plansTourSteps}
          tourActive={tourActive}
          currentStep={currentStep}
          onAdvance={advance}
          onSkip={dismiss}
        />
      </div>
    </div>
  );
}
