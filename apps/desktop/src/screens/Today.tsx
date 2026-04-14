import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCapture, completeTask, getDailyReview, getGraphSummary, listTasks } from '../ipc';
import { useModules } from '../hooks/useModules';
import type { ScreenId } from '../types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Welcome back';
}

function getLastSyncLabel(updatedAt?: string): string {
  if (!updatedAt) return 'just now';
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000);
  if (diff < 1) return 'just now';
  return `${diff} min ago`;
}

interface Props {
  onNavigate: (screen: ScreenId) => void;
}

export function Today({ onNavigate }: Props): JSX.Element {
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
  const reviewQuery = useQuery({ queryKey: ['daily-review'], queryFn: getDailyReview });
  const { modulesQuery } = useModules();

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
  const pendingCaptures = reviewQuery.data?.pendingCaptures ?? 0;
  const unacknowledgedReminders = reviewQuery.data?.unacknowledgedReminders ?? 0;
  const connectedServices = modulesQuery.data?.filter((m) => m.enabled).length ?? 0;
  const lastSyncLabel = getLastSyncLabel(graphQuery.data?.updatedAt);
  const hasResolvedTodayData =
    tasksQuery.isSuccess && reviewQuery.isSuccess && graphQuery.isSuccess;

  const isAllClear =
    tasks.length === 0 &&
    pendingCaptures === 0 &&
    unacknowledgedReminders === 0 &&
    activeGoals.length === 0;

  const trustBar = (
    <div className="trust-bar">
      <span className="trust-dot" aria-hidden="true" />
      <span>Local only</span>
      <span className="trust-separator">·</span>
      <span>Last sync {lastSyncLabel}</span>
      <span className="trust-separator">·</span>
      <span>{connectedServices} services connected</span>
    </div>
  );

  const greetingBlock = (
    <div className="greeting-block">
      <h2>{getGreeting()}</h2>
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
        ref={captureRef}
        className="capture-input"
        type="text"
        placeholder="+ Capture a task, thought, question, or reminder…"
        value={captureText}
        disabled={captureMutation.isPending}
        onChange={(e) => setCaptureText(e.target.value)}
        onKeyDown={handleCaptureKeyDown}
        aria-label="Quick capture"
      />
      {captureConfirmed && <span className="capture-confirm">Captured ✓</span>}
    </div>
  );

  const footerStrip = (
    <div className="footer-strip card card-wide">
      <span>● Local-first</span>
      <span className="trust-separator">·</span>
      <span>Last sync: {lastSyncLabel}</span>
      <span className="trust-separator">·</span>
      <span>{connectedServices} services connected</span>
    </div>
  );

  if (tasksQuery.isError) {
    return (
      <div className="screen-grid">
        {trustBar}
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
        {footerStrip}
      </div>
    );
  }

  if (hasResolvedTodayData && isAllClear) {
    return (
      <div className="screen-grid">
        {trustBar}
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
            <button type="button" onClick={() => onNavigate('review')}>
              Start a review
            </button>
          </div>
        </div>
        {quickCapture}
        {footerStrip}
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
      {trustBar}
      {greetingBlock}
      {nextUpCard}
      {triageCard}
      {planCard}
      {remindersCard}
      {quickCapture}
      {footerStrip}
    </div>
  );
}
