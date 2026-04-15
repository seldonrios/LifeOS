interface TrustIndicatorProps {
  localOnlyMode: boolean;
  connectedServices: number;
  lastSyncLabel: string;
}

export function TrustIndicator({
  localOnlyMode,
  connectedServices,
  lastSyncLabel,
}: TrustIndicatorProps): JSX.Element {
  return (
    <div className="trust-bar">
      <span className="trust-dot" aria-hidden="true" />
      <span>{localOnlyMode ? 'Local only' : 'Local + connected services'}</span>
      <span className="trust-separator">·</span>
      <span>Last sync {lastSyncLabel}</span>
      <span className="trust-separator">·</span>
      <span>{connectedServices} services connected</span>
    </div>
  );
}
