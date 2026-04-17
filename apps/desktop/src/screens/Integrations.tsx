import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listIntegrations } from '../ipc';
import type { IntegrationStatus } from '../ipc';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { Marketplace } from './Marketplace';

export function Integrations(): JSX.Element {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['integrations'],
    queryFn: listIntegrations,
  });

  async function handleCopy(row: IntegrationStatus): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      setCopyError(row.id);
      return;
    }
    try {
      await navigator.clipboard.writeText(row.cliCommand);
      setCopyError(null);
      setCopiedId(row.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch {
      setCopyError(row.id);
    }
  }

  return (
    <div className="integrations-layout">
      <section data-testid="service-connections-section">
        <h2>Service Connections</h2>
        {isLoading && <Spinner label="Loading connections..." />}
        {isError && (
          <ErrorBanner
            message="Could not load integration status."
            onRetry={() => void refetch()}
          />
        )}
        {!isLoading && !isError && data && (
          <ul className="integration-list">
            {data.map((row) => (
              <li key={row.id} className="integration-row">
                <span
                  className={`status-dot ${row.connected ? 'status-dot--connected' : 'status-dot--disconnected'}`}
                  aria-hidden="true"
                />
                <span className="integration-label">{row.label}</span>
                {row.connected ? (
                  <span className="integration-status">
                    Connected
                    {row.expiresAt != null && (
                      <span className="integration-expiry"> · expires {row.expiresAt}</span>
                    )}
                  </span>
                ) : (
                  <span className="integration-status">
                    <span>Not connected</span>
                    <button
                      type="button"
                      data-testid={`connect-btn-${row.id}`}
                      onClick={() => void handleCopy(row)}
                    >
                      {copiedId === row.id ? 'Copied!' : 'Connect via CLI'}
                    </button>
                    <code className="cli-hint">{row.cliCommand}</code>
                    {copyError === row.id && (
                      <span className="copy-error" role="alert">
                        Could not copy. Run manually: <code>{row.cliCommand}</code>
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section data-testid="marketplace-section">
        <h2>Module Marketplace</h2>
        <Marketplace />
      </section>
    </div>
  );
}
