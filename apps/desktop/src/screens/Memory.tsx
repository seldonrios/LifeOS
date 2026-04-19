import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMemory } from '../ipc';
import type { MemoryEntry } from '../ipc';

function timeAgo(ms: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ms);
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

export function Memory(): JSX.Element {
  const [query, setQuery] = useState('');

  const memoryQuery = useQuery({
    queryKey: ['memory'],
    queryFn: () => listMemory(),
  });

  const filteredEntries = useMemo<MemoryEntry[]>(() => {
    const entries = memoryQuery.data ?? [];
    if (!query) return entries;
    const lowered = query.toLowerCase();
    return entries.filter((entry) => entry.content.toLowerCase().includes(lowered));
  }, [memoryQuery.data, query]);

  if (memoryQuery.isError) {
    return (
      <div className="screen-error">
        <p>Something went wrong loading your captures. Please try again.</p>
        <button
          className="primary-btn"
          type="button"
          onClick={() => void memoryQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="screen-memory">
      <div className="memory-search-bar">
        <input
          data-testid="memory-search"
          placeholder="Search your captures…"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="ghost-btn" type="button">
          Search
        </button>
      </div>

      {memoryQuery.isPending ? (
        <div className="loading-state">
          <p>Loading your captures…</p>
        </div>
      ) : filteredEntries.length === 0 && query ? (
        <div className="empty-state">
          <p>No captures match your search.</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">📥</span>
          <p>Nothing captured yet. Use Quick Capture to add your first thought.</p>
        </div>
      ) : (
        <section className="memory-capture-list">
          <p className="section-label">Recent captures — {filteredEntries.length} results</p>
          {filteredEntries.map((entry) => (
            <div className="card memory-card" key={entry.id}>
              <p className="capture-content">{entry.content}</p>
              <div className="capture-meta">
                <span className="muted">{timeAgo(new Date(entry.capturedAt).getTime())}</span>
                <span className="muted">{entry.type}</span>
                {entry.tags[0] != null && (
                  <span className="badge">{entry.tags[0]}</span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
