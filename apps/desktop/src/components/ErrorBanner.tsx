interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps): JSX.Element {
  return (
    <div className="error-banner" role="alert">
      <span className="error-icon" aria-hidden="true">⚠</span>
      <span className="error-message">{message}</span>
      {onRetry ? (
        <button className="error-action" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      {onDismiss ? (
        <button className="error-action error-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      ) : null}
    </div>
  );
}
