import { useEffect, useMemo, useState } from 'react';
import type { InboxItem } from '@lifeos/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FeatureTour } from '../components/FeatureTour';
import { usePageTour } from '../hooks/usePageTour';
import { createTask, listInboxItems, scheduleReminder } from '../ipc';
import { inboxTourSteps } from '../tours';

type InboxTab = 'all' | 'needs-triage' | 'converted' | 'deferred';

function timeAgo(createdAt: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - createdAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return 'Just now';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}m ago`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}h ago`;
  }
  if (diff < 2 * day) {
    return 'Yesterday';
  }
  return `${Math.floor(diff / day)}d ago`;
}

function sourceIcon(item: InboxItem): string {
  const source = String((item as InboxItem & { source?: string }).source ?? '').toLowerCase();
  if (source === 'voice') return '🎙️';
  if (source === 'typed') return '✏️';
  if (source === 'notification' || item.type === 'notification') return '🔔';
  return '📥';
}

function typeBadgeLabel(item: InboxItem): string {
  return `LifeOS thinks: ${item.type}`;
}

interface InboxCardProps {
  item: InboxItem;
  isPending: boolean;
  badgeId?: string;
  badgeDescribedBy?: string;
  onMakeTask: (item: InboxItem) => void;
  onScheduleReminder: (item: InboxItem) => void;
  onMakePlan: (item: InboxItem) => void;
  onSaveAsNote: (item: InboxItem) => void;
  onDefer: (item: InboxItem) => void;
  onDelete: (item: InboxItem) => void;
}

function InboxCard({
  item,
  isPending,
  badgeId,
  badgeDescribedBy,
  onMakeTask,
  onScheduleReminder,
  onMakePlan,
  onSaveAsNote,
  onDefer,
  onDelete,
}: InboxCardProps): JSX.Element {
  return (
    <section className="card card-wide inbox-card">
      <div className="source-icon" aria-hidden="true">
        {sourceIcon(item)}
      </div>
      <div className="inbox-card-body">
        <p className="card-text">{item.title}</p>
        <div className="card-meta">
          <span className="badge" id={badgeId} aria-describedby={badgeDescribedBy}>
            {typeBadgeLabel(item)}
          </span>
          <span className="muted">{timeAgo(item.createdAt)}</span>
        </div>
        <div className="inbox-actions-row">
          <button className="primary-btn" type="button" disabled={isPending} onClick={() => onMakeTask(item)}>
            Make task
          </button>
          <button className="ghost-btn" type="button" disabled={isPending} onClick={() => onMakePlan(item)}>
            Make plan
          </button>
          <button
            className="ghost-btn"
            type="button"
            disabled={isPending}
            onClick={() => onScheduleReminder(item)}
          >
            Schedule reminder
          </button>
          <button className="ghost-btn" type="button" disabled={isPending} onClick={() => onSaveAsNote(item)}>
            Save as note
          </button>
          <button className="ghost-btn" type="button" disabled={isPending} onClick={() => onDefer(item)}>
            Defer
          </button>
          <button className="ghost-btn" type="button" disabled={isPending} onClick={() => onDelete(item)}>
            Delete
          </button>
        </div>
      </div>
    </section>
  );
}

interface Props {
  onResetTour?: (resetTour: (() => void) | null) => void;
}

export function Inbox({ onResetTour }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<InboxTab>('all');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: listInboxItems });
  const items = inboxQuery.data ?? [];
  const { tourActive, currentStep, advance, dismiss, reset } = usePageTour(
    'inbox',
    !inboxQuery.isPending && !inboxQuery.isError && items.length > 0,
  );

  useEffect(() => {
    onResetTour?.(reset);
    return () => onResetTour?.(null);
  }, [onResetTour, reset]);

  const setTransientMessage = (message: string): void => {
    setActionMessage(message);
    setTimeout(() => setActionMessage(null), 2_000);
  };

  const makeTaskMutation = useMutation({
    mutationFn: ({ captureId, title }: { captureId: string; title: string }) =>
      createTask(captureId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      setActionError(null);
      setTransientMessage('Task created ✓');
    },
    onError: () => {
      setActionError('LifeOS could not create a task right now. Please try again.');
    },
  });

  const scheduleReminderMutation = useMutation({
    mutationFn: ({ captureId, title }: { captureId: string; title: string }) =>
      scheduleReminder(captureId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      setActionError(null);
      setTransientMessage('Reminder scheduled ✓');
    },
    onError: () => {
      setActionError('LifeOS could not schedule a reminder right now. Please try again.');
    },
  });

  const filteredItems = useMemo(() => {
    if (activeTab === 'needs-triage') {
      return items.filter((item) => !item.read);
    }
    if (activeTab === 'converted' || activeTab === 'deferred') {
      return [] as InboxItem[];
    }
    return items;
  }, [activeTab, items]);

  const handleMakeTask = (item: InboxItem): void => {
    setPendingActionId(item.id);
    setActionError(null);
    void makeTaskMutation
      .mutateAsync({ captureId: item.id, title: item.title })
      .finally(() => setPendingActionId(null));
  };

  const handleScheduleReminder = (item: InboxItem): void => {
    setPendingActionId(item.id);
    setActionError(null);
    void scheduleReminderMutation
      .mutateAsync({ captureId: item.id, title: item.title })
      .finally(() => setPendingActionId(null));
  };

  const handleStubAction = (action: string): void => {
    console.log(`Coming soon: ${action}`);
    setTransientMessage('Coming soon');
  };

  return (
    <div className="screen-grid">
      <div
        className="inbox-tabs"
        id="inbox-header"
        aria-describedby={tourActive && currentStep === 0 ? `coachmark-${currentStep + 1}` : undefined}
      >
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'needs-triage', label: 'Needs triage' },
            { id: 'converted', label: 'Converted' },
            { id: 'deferred', label: 'Deferred' },
          ] as Array<{ id: InboxTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label} {tab.id === 'all' ? `(${items.length})` : ''}
          </button>
        ))}
      </div>

      <div
        className="batch-bar card"
        id="inbox-batch-bar"
        aria-describedby={tourActive && currentStep === 2 ? `coachmark-${currentStep + 1}` : undefined}
      >
        <span>Triage mode: review 5 at a time</span>
        <button
          className="ghost-btn"
          type="button"
          onClick={() => {
            handleStubAction('batch triage');
          }}
        >
          Start batch triage →
        </button>
      </div>

      {actionMessage ? (
        <div className="card card-wide">
          <p>{actionMessage}</p>
        </div>
      ) : null}

      {actionError ? (
        <div className="card card-wide">
          <p>{actionError}</p>
        </div>
      ) : null}

      {inboxQuery.isError && (
        <div className="card card-wide">
          <p>
            LifeOS couldn&apos;t load your inbox right now. You can still capture items and check back
            shortly.
          </p>
          <button type="button" onClick={() => void inboxQuery.refetch()}>
            Try again
          </button>
        </div>
      )}

      {!inboxQuery.isError && !inboxQuery.isPending && filteredItems.length === 0 && (
        <div className="card card-wide empty-state">
          <p>No items waiting.</p>
          {(activeTab === 'converted' || activeTab === 'deferred') && <p>Coming soon.</p>}
        </div>
      )}

      {filteredItems.map((item, index) => (
        <InboxCard
          key={item.id}
          item={item}
          isPending={pendingActionId === item.id}
          badgeId={index === 0 ? 'inbox-type-badge' : undefined}
          badgeDescribedBy={tourActive && currentStep === 1 && index === 0 ? `coachmark-${currentStep + 1}` : undefined}
          onMakeTask={handleMakeTask}
          onScheduleReminder={handleScheduleReminder}
          onMakePlan={() => handleStubAction('make plan')}
          onSaveAsNote={() => handleStubAction('save as note')}
          onDefer={() => handleStubAction('defer')}
          onDelete={() => handleStubAction('delete')}
        />
      ))}
      <FeatureTour
        steps={inboxTourSteps}
        tourActive={tourActive}
        currentStep={currentStep}
        onAdvance={advance}
        onSkip={dismiss}
      />
    </div>
  );
}
