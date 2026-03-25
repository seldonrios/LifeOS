import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMarketplace } from '../ipc';
import { useModules } from '../hooks/useModules';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

export function Marketplace(): JSX.Element {
  const [search, setSearch] = useState('');
  const marketplaceQuery = useQuery({
    queryKey: ['marketplace'],
    queryFn: () => listMarketplace(false),
  });
  const { modulesQuery, enableMutation, disableMutation } = useModules();

  const rows = useMemo(() => {
    const all = marketplaceQuery.data ?? [];
    const searchTerm = search.trim().toLowerCase();
    if (!searchTerm) {
      return all;
    }
    return all.filter(
      (entry) =>
        entry.id.toLowerCase().includes(searchTerm) ||
        entry.description.toLowerCase().includes(searchTerm) ||
        entry.repo.toLowerCase().includes(searchTerm),
    );
  }, [marketplaceQuery.data, search]);

  if (marketplaceQuery.isLoading || modulesQuery.isLoading) {
    return <Spinner label="Loading marketplace..." />;
  }

  if (marketplaceQuery.error || modulesQuery.error) {
    return <ErrorBanner message="Unable to load marketplace." />;
  }

  const enabled = new Set((modulesQuery.data ?? []).filter((item) => item.enabled).map((item) => item.id));

  return (
    <div className="marketplace-layout">
      <div className="marketplace-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search modules..."
          aria-label="Search modules"
        />
      </div>
      <div className="marketplace-grid">
        {rows.map((entry) => {
          const isEnabled = enabled.has(entry.id);
          return (
            <article className="module-card" key={entry.id}>
              <h3>{entry.id}</h3>
              <p>{entry.description}</p>
              <div className="row space-between">
                <span className={`badge ${entry.certified ? 'badge-certified' : 'badge-community'}`}>
                  {entry.certified ? 'Certified' : 'Community'}
                </span>
                <small>{entry.resourceHint}</small>
              </div>
              <button
                className={isEnabled ? 'secondary-btn' : 'primary-btn'}
                type="button"
                onClick={() => {
                  if (isEnabled) {
                    void disableMutation.mutateAsync(entry.id);
                    return;
                  }
                  void enableMutation.mutateAsync(entry.id);
                }}
              >
                {isEnabled ? 'Disable' : 'Enable'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
