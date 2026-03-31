import type { CSSProperties, JSX } from 'react';

import { lightColors, spacing, typography } from '@lifeos/ui';

import { readDisplayConfig } from './lib/config';
import { useDisplayFeed } from './hooks/useDisplayFeed';

const config = readDisplayConfig();

function EmptyState({ message }: { message: string }): JSX.Element {
  return <p className="empty-text">{message}</p>;
}

export function App(): JSX.Element {
  const {
    query,
    lifecycleMessage,
    completeChore,
    addReminderToShopping,
    actionsPending,
  } = useDisplayFeed(config);

  const missingConfig =
    config.homeNodeUrl.length === 0 ||
    config.householdId.length === 0 ||
    config.surfaceToken.length === 0;
  if (missingConfig) {
    return (
      <main className="shell shell-setup">
        <section className="setup-card">
          <h1>Shared Display Not Configured</h1>
          <p>
            Set <code>VITE_HOME_NODE_URL</code>, <code>VITE_HOUSEHOLD_ID</code>, and{' '}
            <code>VITE_SURFACE_TOKEN</code> before running this display app.
          </p>
          <p>
            Optional values: <code>VITE_SURFACE_ID</code>, <code>VITE_SURFACE_KIND</code>, and{' '}
            <code>VITE_DISPLAY_POLL_MS</code>.
          </p>
        </section>
      </main>
    );
  }

  if (query.isLoading && !query.data) {
    return (
      <main className="shell">
        <section className="status-banner">Connecting to Home Node...</section>
      </main>
    );
  }

  if (!query.data) {
    return (
      <main className="shell">
        <section className="status-banner status-banner-error">
          {query.error instanceof Error
            ? query.error.message
            : 'Display feed unavailable and no cached data yet'}
        </section>
      </main>
    );
  }

  const feed = query.data;
  const quietHoursActive = feed.householdNotices.some(
    (notice) =>
      notice.id === 'quiet-hours' ||
      /quiet hours/i.test(notice.title) ||
      /quiet hours/i.test(notice.message ?? ''),
  );
  const degraded = feed.stale || !!query.error || !!lifecycleMessage;

  const heading = config.mode === 'hallway' ? 'Hallway Board' : 'Kitchen Board';
  const eventLead = feed.todayEvents[0];
  const reminderLead = feed.topReminders[0];

  return (
    <main
      className={`shell shell-${config.mode}`}
      style={
        {
          '--bg-primary': lightColors.background.primary,
          '--ink-primary': lightColors.text.primary,
          '--ink-secondary': lightColors.text.secondary,
          '--accent-brand': lightColors.accent.brand,
          '--accent-warning': lightColors.accent.warning,
          '--space-4': `${spacing[4]}px`,
          '--space-8': `${spacing[8]}px`,
          '--font-xl': `${typography.fontSize.xl}px`,
          '--font-2xl': `${typography.fontSize['2xl']}px`,
        } as CSSProperties
      }
    >
      <header className="top-bar">
        <h1>{heading}</h1>
        <p>{new Date(feed.generatedAt).toLocaleTimeString()}</p>
      </header>

      {degraded ? (
        <section className="status-banner status-banner-warning">
          {lifecycleMessage ?? 'Feed degraded. Showing last known household snapshot.'}
        </section>
      ) : null}

      {quietHoursActive ? (
        <section className="panel panel-hero">
          <h2>Quiet Hours Active</h2>
          <p className="hero-line">Ambient mode enabled</p>
          <p className="hero-subtle">
            Non-urgent content is hidden until quiet hours end.
          </p>
        </section>
      ) : null}

      <section className="notice-row">
        {feed.householdNotices.length === 0 ? (
          <EmptyState message="No notices right now." />
        ) : (
          feed.householdNotices.map((notice) => (
            <article
              key={notice.id}
              className={`notice-card ${notice.severity === 'warning' ? 'notice-warning' : ''}`}
            >
              <h2>{notice.title}</h2>
              {notice.message ? <p>{notice.message}</p> : null}
            </article>
          ))
        )}
      </section>

      {quietHoursActive ? null : config.mode === 'hallway' ? (
        <section className="grid hallway-grid">
          <article className="panel panel-hero">
            <h2>Next Up</h2>
            <p className="hero-line">{eventLead ? eventLead.title : 'No upcoming events'}</p>
            <p className="hero-subtle">{eventLead?.startsAt ? new Date(eventLead.startsAt).toLocaleTimeString() : 'Today is clear'}</p>
          </article>

          <article className="panel panel-hero">
            <h2>Reminder</h2>
            <p className="hero-line">{reminderLead ? reminderLead.title : 'No reminders'}</p>
            <p className="hero-subtle">{reminderLead?.remindAt ? new Date(reminderLead.remindAt).toLocaleTimeString() : 'All set'}</p>
          </article>

          <article className="panel">
            <h2>At a Glance</h2>
            <ul>
              <li>{feed.todayEvents.length} events</li>
              <li>{feed.choresDueToday.length} chores due</li>
              <li>{feed.shoppingItems.length} shopping items</li>
              <li>{feed.topReminders.length} reminders</li>
            </ul>
          </article>
        </section>
      ) : (
        <section className="grid kitchen-grid">
          <article className="panel">
            <h2>Today Events</h2>
            {feed.todayEvents.length === 0 ? (
              <EmptyState message="No events today." />
            ) : (
              <ul>
                {feed.todayEvents.map((event) => (
                  <li key={event.id}>
                    <span>{event.title}</span>
                    <time>{event.startsAt ? new Date(event.startsAt).toLocaleTimeString() : ''}</time>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="panel">
            <h2>Chores Due</h2>
            {feed.choresDueToday.length === 0 ? (
              <EmptyState message="No chores due today." />
            ) : (
              <ul>
                {feed.choresDueToday.map((chore) => (
                  <li key={chore.id}>
                    <span>{chore.title}</span>
                    <div className="quick-action-row">
                      <time>{chore.dueAt ? new Date(chore.dueAt).toLocaleTimeString() : ''}</time>
                      <button
                        className="quick-action-button"
                        type="button"
                        disabled={actionsPending}
                        onClick={() => completeChore(chore.id)}
                      >
                        Mark chore done
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="panel">
            <h2>Shopping</h2>
            {feed.shoppingItems.length === 0 ? (
              <EmptyState message="Shopping list is clear." />
            ) : (
              <ul>
                {feed.shoppingItems.map((item) => (
                  <li key={item.id}>
                    <span>{item.title}</span>
                    <span className="pill">{item.status ?? 'added'}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="panel">
            <h2>Top Reminders</h2>
            {feed.topReminders.length === 0 ? (
              <EmptyState message="No reminders queued." />
            ) : (
              <ul>
                {feed.topReminders.map((reminder) => (
                  <li key={reminder.id}>
                    <span>{reminder.title}</span>
                    <div className="quick-action-row">
                      <time>
                        {reminder.remindAt ? new Date(reminder.remindAt).toLocaleTimeString() : ''}
                      </time>
                      <button
                        className="quick-action-button"
                        type="button"
                        disabled={actionsPending}
                        onClick={() => addReminderToShopping(reminder.title)}
                      >
                        Add to shopping list
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
