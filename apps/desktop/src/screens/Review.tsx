import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDailyReview } from '../ipc';

type ReviewTab = 'daily' | 'weekly';

export function Review(): JSX.Element {
  const [activeTab, setActiveTab] = useState<ReviewTab>('daily');
  const [tomorrowNote, setTomorrowNote] = useState('');
  const reviewQuery = useQuery({ queryKey: ['daily-review'], queryFn: getDailyReview });

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

  if (isEmpty) {
    return (
      <div className="screen-grid">
        <section className="card card-wide empty-state">
          <h3>No review yet today.</h3>
          <button
            className="primary-btn"
            type="button"
            onClick={() => {
              console.log('Coming soon: start daily review');
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
      <section className="card card-wide">
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
          <p className="muted">Weekly review coming soon.</p>
        </section>
      ) : (
        <>
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
              value={tomorrowNote}
              onChange={(e) => setTomorrowNote(e.target.value)}
              placeholder="Add a note for tomorrow…"
              aria-label="Tomorrow note"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </section>

          <div className="card card-wide" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="primary-btn"
              type="button"
              onClick={() => {
                console.log('Coming soon: close day');
              }}
            >
              Close day
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => {
                console.log('Coming soon: move all open to tomorrow');
              }}
            >
              Move all open to tomorrow
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => {
                console.log('Coming soon: archive completed');
              }}
            >
              Archive completed
            </button>
          </div>
        </>
      )}
    </div>
  );
}
