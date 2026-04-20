import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FeatureTour } from '../components/FeatureTour';
import { usePageTour } from '../hooks/usePageTour';
import { createCapture, completeTask, getDailyReview, getGraphSummary, listTasks, readSettings } from '../ipc';
import { todayTourSteps } from '../tours';
import type { ScreenId } from '../types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Welcome back';
}

interface Props {
  onNavigate: (screen: ScreenId) => void;
  onResetTour?: (resetTour: (() => void) | null) => void;
}

export function Today({ onNavigate, onResetTour }: Props): JSX.Element {
  const [captureText, setCaptureText] = useState('');
  const [captureConfirmed, setCaptureConfirmed] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: listTasks });
  const graphQuery = useQuery({
    queryKey: ['graph-summary'],
    queryFn: getGraphSummary,
    staleTime: 10_000,
  });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: readSettings });
  const reviewQuery = useQuery({ queryKey: ['daily-review'], queryFn: getDailyReview });

  const captureMutation = useMutation({
    mutationFn: createCapture,
    onSuccess: () => {
      setCaptureText('');
      setCaptureConfirmed(true);
      setTimeout(() => setCaptureConfirmed(false), 2_000);
    },
  });

  const tasks = tasksQuery.data ?? [];
  const activeGoals = graphQuery.data?.activeGoals ?? [];
  const assistantName = settingsQuery.data?.assistantName ?? 'LifeOS';
  const pendingCaptures = reviewQuery.data?.pendingCaptures ?? 0;
  const unacknowledgedReminders = reviewQuery.data?.unacknowledgedReminders ?? 0;
  const hasResolvedTodayData =
    tasksQuery.isSuccess && reviewQuery.isSuccess && graphQuery.isSuccess;

  const isAllClear =
    tasks.length === 0 &&
    pendingCaptures === 0 &&
    unacknowledgedReminders === 0 &&
    activeGoals.length === 0;

  const { tourActive, currentStep, advance, dismiss, reset } = usePageTour(
    'today',
    hasResolvedTodayData && !isAllClear,
  );

  useEffect(() => {
    onResetTour?.(reset);
    return () => onResetTour?.(null);
  }, [onResetTour, reset]);

  const greetingBlock = (
    <div
      className="greeting-block"
      id="today-greeting"
      aria-describedby={tourActive && currentStep === 0 ? `coachmark-${currentStep + 1}` : undefined}
    >
      <h2>
        {getGreeting()}
        {assistantName && assistantName !== 'LifeOS' ? `. I'm ${assistantName}.` : '.'}
      </h2>
      <p className="summary-line">
        {tasks.length} priority items · {unacknowledgedReminders} reminders today ·{' '}
        {activeGoals.length} plans waiting
      </p>
    </div>
  );

  function handleCaptureKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && captureText.trim()) {
      captureMutation.mutate(captureText.trim());
    }
  }

  const quickCapture = (
    <div className="card card-wide">
      <input
        id="today-capture"
        ref={captureRef}
        className="capture-input"
        type="text"
        placeholder="+ Capture a task, thought, question, or reminder…"
        value={captureText}
        disabled={captureMutation.isPending}
        onChange={(e) => setCaptureText(e.target.value)}
        onKeyDown={handleCaptureKeyDown}
        aria-label="Quick capture"
        aria-describedby={tourActive && currentStep === 1 ? `coachmark-${currentStep + 1}` : undefined}
      />
      {captureConfirmed && <span className="capture-confirm">Captured ✓</span>}
    </div>
  );

  if (tasksQuery.isError) {
    return (
      <div className="screen-grid">
        {greetingBlock}
        <div className="card card-wide">
          <p>
            LifeOS couldn&apos;t load your tasks right now. You can still capture items and check
            back shortly.
          </p>
          <button type="button" onClick={() => void tasksQuery.refetch()}>
            Try again
          </button>
        </div>
        {quickCapture}
      </div>
    );
  }

  if (hasResolvedTodayData && isAllClear) {
    return (
      <div className="screen-grid">
        {greetingBlock}
        <div className="card card-wide empty-state">
          <h3>You&apos;re all clear right now.</h3>
          <div className="empty-actions">
            <button type="button" onClick={() => captureRef.current?.focus()}>
              Capture something
            </button>
            <button type="button" onClick={() => onNavigate('plans')}>
              Plan a goal
            </button>
            <button
              id="today-review-link"
              type="button"
              onClick={() => onNavigate('review')}
              aria-describedby={tourActive && currentStep === 2 ? `coachmark-${currentStep + 1}` : undefined}
            >
              Start a review
            </button>
          </div>
        </div>
        {quickCapture}
      </div>
    );
  }

  const topTasks = tasks.slice(0, 2);

  const nextUpCard = (
    <section className="card">
      <div className="card-label">NEXT UP</div>
      {topTasks.length === 0 ? (
        <p className="muted">Nothing due right now.</p>
      ) : (
        topTasks.map((task) => (
          <div className="action-row" key={task.id}>
            <span>{task.title}</span>
            <div className="task-actions">
              {task.dueDate ? (
                <span
                  className={`badge${task.dueDate === 'Overdue' || task.dueDate === 'Today' ? ' warn' : ''}`}
                >
                  {task.dueDate}
                </span>
              ) : null}
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  void completeTask(task.id).then(() =>
                    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
                  );
                }}
              >
                Mark done
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );

  const triageCard = (
    <section className="card">
      <div className="card-label">AWAITING TRIAGE</div>
      {pendingCaptures === 0 ? (
        <p className="muted">Inbox is clear.</p>
      ) : (
        <div className="action-row">
          <span>{pendingCaptures} items pending</span>
          <span className="badge warn">Needs attention</span>
        </div>
      )}
    </section>
  );

  const firstGoal = activeGoals[0];
  const planCard = (
    <section className="card">
      <div className="card-label">SUGGESTED PLAN</div>
      {!firstGoal ? (
        <p className="muted">No active plans.</p>
      ) : (
        <div className="action-row">
          <span>{firstGoal.title ?? firstGoal.id}</span>
          <span className="badge">
            {firstGoal.completedTasks ?? 0}/{firstGoal.totalTasks ?? 0} steps
          </span>
        </div>
      )}
    </section>
  );

  const remindersCard = (
    <section className="card">
      <div className="card-label">REMINDERS TODAY</div>
      {unacknowledgedReminders === 0 ? (
        <p className="muted">No reminders today.</p>
      ) : (
        <div className="action-row">
          <span>{unacknowledgedReminders} reminders</span>
          <span className="badge warn">{unacknowledgedReminders}</span>
        </div>
      )}
    </section>
  );

  return (
    <div className="screen-grid">
      {greetingBlock}
      {nextUpCard}
      {triageCard}
      {planCard}
      {remindersCard}
      {quickCapture}
      <div className="card card-wide">
        <button
          id="today-review-link"
          type="button"
          className="ghost-btn"
          onClick={() => onNavigate('review')}
          aria-describedby={tourActive && currentStep === 2 ? `coachmark-${currentStep + 1}` : undefined}
        >
          Start a review
        </button>
      </div>
      <FeatureTour
        steps={todayTourSteps}
        tourActive={tourActive}
        currentStep={currentStep}
        onAdvance={advance}
        onSkip={dismiss}
      />
    </div>
  );
}
