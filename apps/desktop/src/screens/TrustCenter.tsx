import { useQuery } from '@tanstack/react-query';

import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { readTrustStatus } from '../ipc';

export function TrustCenter(): JSX.Element {
  const trustQuery = useQuery({
    queryKey: ['trust-status'],
    queryFn: readTrustStatus,
    staleTime: 15_000,
  });

  if (trustQuery.isLoading) {
    return <Spinner label="Loading ownership and trust details..." />;
  }

  if (trustQuery.error || !trustQuery.data) {
    return <ErrorBanner message="Unable to load trust status." />;
  }

  const trust = trustQuery.data;
  const enabledModules = trust.modules.filter((module) => module.enabled).length;

  return (
    <div className="trust-layout">
      <section className="card card-wide">
        <h3>OWNERSHIP SUMMARY</h3>
        <p>{trust.ownership.dataOwnership}</p>
        <p className="muted">{trust.ownership.methodsTransparency}</p>
        <div className="trust-pill-row">
          <span className={`status-pill ${trust.ownership.localFirstDefault ? 'trust-pill-local' : 'trust-pill-cloud'}`}>
            {trust.ownership.localFirstDefault ? 'Local-first default' : 'Cloud assist active'}
          </span>
          <span className="status-pill">
            {enabledModules}/{trust.modules.length} modules enabled
          </span>
        </div>
      </section>

      <section className="card">
        <h3>RUNTIME TRANSPARENCY</h3>
        <div className="trust-kv">
          <span>Model</span>
          <strong>{trust.runtime.model}</strong>
        </div>
        <div className="trust-kv">
          <span>Policy enforcement</span>
          <strong>{trust.runtime.policyEnforced ? 'On' : 'Off'}</strong>
        </div>
        <div className="trust-kv">
          <span>Manifest required</span>
          <strong>{trust.runtime.moduleManifestRequired ? 'Yes' : 'No'}</strong>
        </div>
        <div className="trust-kv">
          <span>Runtime permissions</span>
          <strong>{trust.runtime.moduleRuntimePermissions}</strong>
        </div>
      </section>

      <section className="card">
        <h3>ACTIVE MODULES</h3>
        <p className="muted">Enabled modules and declared permission scope.</p>
        <div className="trust-module-list">
          {trust.modules.filter((module) => module.enabled).map((module) => (
            <article key={module.id} className="trust-module-item">
              <div className="row space-between">
                <strong>{module.id}</strong>
                <small className="muted">{module.tier}</small>
              </div>
              <small className="muted">graph: {module.permissions.graph.join(', ') || 'none'}</small>
              <small className="muted">events: {module.permissions.events.length}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="card card-wide">
        <h3>RECENT DECISIONS</h3>
        <div className="trust-timeline">
          {trust.recentDecisions.map((entry, index) => (
            <div className="trust-timeline-item" key={`${entry.category}-${entry.at}-${index}`}>
              <span className="trust-dot" aria-hidden="true" />
              <div>
                <strong>{entry.category.toUpperCase()}</strong>
                <p>{entry.message}</p>
                <small className="muted">{new Date(entry.at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
