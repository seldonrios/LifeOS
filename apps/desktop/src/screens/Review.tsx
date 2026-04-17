import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FeatureTour } from '../components/FeatureTour';
import { usePageTour } from '../hooks/usePageTour';
import { archiveCompleted, closeDay, getDailyReview, moveAllOpenToTomorrow } from '../ipc';
import { reviewTourSteps } from '../tours';

type ReviewTab = 'daily' | 'weekly';

interface Props {
  onResetTour?: (resetTour: (() => void) | null) => void;
}

export function Review({ onResetTour }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<ReviewTab>('daily');
  const [tomorrowNote, setTomorrowNote] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dayClosedState, setDayClosedState] = useState(false);
  const queryClient = useQueryClient();
  const reviewQuery = useQuery({ queryKey: ['daily-review'], queryFn: getDailyReview });

  const setTransientMessage = (message: string): void => {
    setActionMessage(message);
    setTimeout(() => setActionMessage(null), 2_000);
  };

  const closeDayMutation = useMutation({
    mutationFn: (note?: string) => closeDay(note),
    onSuccess: () => {
      setDayClosedState(true);
      void queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      setActionError(null);
      setTransientMessage('Day closed. See you tomorrow.');
    },
    onError: () => {
      setActionError("LifeOS couldn't close your day right now.");
    },
  });

  const moveAllOpenMutation = useMutation({
    mutationFn: moveAllOpenToTomorrow,
    onSuccess: (data) => {
      setActionError(null);
      setTransientMessage(`Moved ${data.movedCount} items to tomorrow ✓`);
      void queryClient.invalidateQueries({ queryKey: ['daily-review'] });
    },
    onError: () => {
      setActionError("LifeOS couldn't move open items right now.");
    },
  });

  const archiveCompletedMutation = useMutation({
    mutationFn: archiveCompleted,
    onSuccess: (data) => {
      setActionError(null);
      setTransientMessage(`Archived ${data.archivedCount} completed items ✓`);
      void queryClient.invalidateQueries({ queryKey: ['daily-review'] });
    },
    onError: () => {
      setActionError("LifeOS couldn't archive completed items right now.");
    },
  });

  const subtitle = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (reviewQuery.isError) {
    return (
      <div className="screen-grid">
        <section className="card card-wide">
          <p>
            LifeOS couldn&apos;t load your review right now. You can still capture items and check
            back shortly.
          </p>
          <button type="button" onClick={() => void reviewQuery.refetch()}>
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (reviewQuery.isPending) {
    return (
      <div className="screen-grid">
        <section className="card card-wide">
          <p className="muted">Loading review…</p>
        </section>
      </div>
    );
  }

  const reviewData = reviewQuery.data;
  const isEmpty =
    reviewQuery.isSuccess &&
    reviewData.completedActions.length === 0 &&
    reviewData.actionsDueToday === 0 &&
    reviewData.pendingCaptures === 0 &&
    reviewData.unacknowledgedReminders === 0;

  const { tourActive, currentStep, advance, dismiss, reset } = usePageTour(
    'review',
    reviewQuery.isSuccess && !isEmpty,
  );

  useEffect(() => {
    onResetTour?.(reset);
    return () => onResetTour?.(null);
  }, [onResetTour, reset]);

  if (isEmpty) {
    return (
      <div className="screen-grid">
        <section className="card card-wide empty-state">
          <h3>No review yet today.</h3>
          <button
            className="primary-btn"
            type="button"
            onClick={() => {
              setActiveTab('daily');
              window.scrollTo(0, 0);
            }}
          >
            Start a 2-minute review
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-grid">
      <section
        className="card card-wide"
        id="review-header"
        aria-describedby={tourActive && currentStep === 0 ? `coachmark-${currentStep + 1}` : undefined}
      >
        <h2 style={{ margin: 0 }}>Review</h2>
        <p className="muted" style={{ marginTop: '6px' }}>
          {subtitle}
        </p>
      </section>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className={`tab-btn${activeTab === 'daily' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTab('daily')}
        >
          Daily
        </button>
        <button
          className={`tab-btn${activeTab === 'weekly' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTab('weekly')}
        >
          Weekly
        </button>
      </div>

      {activeTab === 'weekly' ? (
        <section className="card card-wide">
          <div className="empty-state" style={{ padding: '8px 0' }}>
            <h3 style={{ marginBottom: '8px' }}>Weekly review is coming soon</h3>
            <p className="muted" style={{ margin: 0 }}>Daily review actions are available now.</p>
          </div>
        </section>
      ) : (
        <>
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

          <section className="card">
            <div className="card-label">COMPLETED TODAY</div>
            {reviewData.completedActions.length === 0 ? (
              <p className="muted">Nothing completed yet.</p>
            ) : (
              reviewData.completedActions.map((action) => (
                <div className="item-row" key={action}>
                  <span>{action}</span>
                  <span className="badge">Done</span>
                </div>
              ))
            )}
          </section>

          <section className="card">
            <div className="card-label">STILL OPEN</div>
            {reviewData.actionsDueToday > 0 ? (
              <div className="item-row">
                <span>{reviewData.actionsDueToday} actions due today</span>
                <span className="badge warn">Overdue</span>
              </div>
            ) : (
              <p className="muted">Nothing overdue.</p>
            )}
          </section>

          <section className="card">
            <div className="card-label">NOT TRIAGED</div>
            {reviewData.pendingCaptures > 0 || reviewData.unacknowledgedReminders > 0 ? (
              <>
                {reviewData.pendingCaptures > 0 ? (
                  <div className="item-row">
                    <span>{reviewData.pendingCaptures} captures waiting</span>
                    <span className="badge warn">Needs attention</span>
                  </div>
                ) : null}
                {reviewData.unacknowledgedReminders > 0 ? (
                  <div className="item-row">
                    <span>{reviewData.unacknowledgedReminders} reminders unacknowledged</span>
                    <span className="badge warn">Needs attention</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">Inbox is clear.</p>
            )}
          </section>

          <section className="card">
            <div className="card-label">CARRY FORWARD</div>
            {reviewData.suggestedNextActions && reviewData.suggestedNextActions.length > 0 ? (
              reviewData.suggestedNextActions.map((action) => (
                <div className="item-row" key={action}>
                  <span>{action}</span>
                </div>
              ))
            ) : (
              <p className="muted">Nothing to carry forward.</p>
            )}
          </section>

          <section className="card card-wide" style={{ border: '1px solid #2d4a7a' }}>
            <p style={{ marginTop: 0 }}>What should matter tomorrow?</p>
            <textarea
              id="review-tomorrow-note"
              value={tomorrowNote}
              onChange={(e) => setTomorrowNote(e.target.value)}
              placeholder="Add a note for tomorrow…"
              aria-label="Tomorrow note"
              aria-describedby={tourActive && currentStep === 1 ? `coachmark-${currentStep + 1}` : undefined}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </section>

          {dayClosedState ? (
            <section className="card card-wide empty-state" style={{ border: '1px solid #2d4a7a' }}>
              <h3 style={{ marginBottom: '8px' }}>Day closed. See you tomorrow.</h3>
              <p className="muted" style={{ margin: 0 }}>
                You can still review details, but today&apos;s wrap-up actions are complete.
              </p>
            </section>
          ) : (
            <div className="card card-wide" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                id="review-close-day"
                className="primary-btn"
                type="button"
                disabled={closeDayMutation.isPending}
                aria-describedby={tourActive && currentStep === 2 ? `coachmark-${currentStep + 1}` : undefined}
                onClick={() => {
                  setActionError(null);
                  void closeDayMutation.mutateAsync(tomorrowNote.trim() ? tomorrowNote : undefined);
                }}
              >
                {closeDayMutation.isPending ? 'Closing day…' : 'Close day'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={moveAllOpenMutation.isPending}
                onClick={() => {
                  setActionError(null);
                  void moveAllOpenMutation.mutateAsync();
                }}
              >
                {moveAllOpenMutation.isPending ? 'Moving…' : 'Move all open to tomorrow'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={archiveCompletedMutation.isPending}
                onClick={() => {
                  setActionError(null);
                  void archiveCompletedMutation.mutateAsync();
                }}
              >
                {archiveCompletedMutation.isPending ? 'Archiving…' : 'Archive completed'}
              </button>
            </div>
          )}
        </>
      )}
      <FeatureTour
        steps={reviewTourSteps}
        tourActive={tourActive}
        currentStep={currentStep}
        onAdvance={advance}
        onSkip={dismiss}
      />
    </div>
  );
}
