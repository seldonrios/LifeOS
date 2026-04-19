import { useEffect, useMemo, useState } from 'react';
import type { HealthCheckResult } from '@lifeos/contracts';
import { createCapture, getUXHealth, writeSettings } from '../ipc';

interface WelcomeOverlayProps {
  onComplete: () => void;
  onSkip: () => void;
}

type SetupStyle = 'recommended' | 'private' | 'builder';

const USE_CASE_OPTIONS = ['Tasks', 'Reminders', 'Goals', 'Reviews', 'Household'];

export function WelcomeOverlay({ onComplete, onSkip }: WelcomeOverlayProps): JSX.Element {
  const [step, setStep] = useState(1);
  const [setupStyle, setSetupStyle] = useState<SetupStyle>('recommended');
  const [useCases, setUseCases] = useState<string[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [healthChecks, setHealthChecks] = useState<HealthCheckResult[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [captureSubmitting, setCaptureSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onSkip();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSkip]);

  useEffect(() => {
    if (step !== 4) {
      return;
    }

    let cancelled = false;
    setHealthLoading(true);

    void getUXHealth()
      .then((response) => {
        if (!cancelled) {
          setHealthChecks(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthChecks([
            {
              key: 'sync',
              title: 'Dashboard service',
              status: 'warn',
              detail: 'Unable to reach health endpoint. Continue and verify local services.',
              repairAction: null,
            },
          ]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHealthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [step]);

  const canSubmitCapture = useMemo(() => captureText.trim().length > 0 && !captureSubmitting, [captureSubmitting, captureText]);

  function toggleUseCase(option: string): void {
    setUseCases((current) => {
      if (current.includes(option)) {
        return current.filter((item) => item !== option);
      }
      return [...current, option];
    });
  }

  async function submitFirstCapture(): Promise<void> {
    if (!captureText.trim() || captureSubmitting) {
      return;
    }

    setCaptureSubmitting(true);
    try {
      await createCapture(captureText.trim());

      let settingsPayload: Parameters<typeof writeSettings>[0];
      if (setupStyle === 'private') {
        settingsPayload = { setupStyle, useCases, localOnlyMode: true, cloudAssistEnabled: false };
      } else if (setupStyle === 'builder') {
        settingsPayload = { setupStyle, useCases, transparencyTipsEnabled: true, trustAuditEnabled: true };
      } else {
        settingsPayload = { setupStyle, useCases };
      }

      await writeSettings(settingsPayload);
      onComplete();
    } finally {
      setCaptureSubmitting(false);
    }
  }

  return (
    <div className="welcome-overlay-backdrop" role="presentation">
      <div className="welcome-card card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="capture-overlay-header">
          <h3>Welcome to LifeOS</h3>
          <button className="ghost-btn" type="button" onClick={onSkip}>
            Skip
          </button>
        </div>
        <p className="welcome-step-indicator">Step {step} of 5</p>

        {step === 1 && (
          <div className="task-list">
            <p>
              LifeOS keeps your plans, reminders, and context local-first. We will do a quick setup so your desktop feels ready from day one.
            </p>
            <div className="row gap-sm">
              <button type="button" className="primary-btn" onClick={() => setStep(2)}>
                Get started
              </button>
              <button type="button" className="secondary-btn" onClick={onSkip}>
                Skip setup
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="task-list">
            <h4>Choose your setup style</h4>
            <button
              type="button"
              className={`welcome-option ${setupStyle === 'recommended' ? 'selected' : ''}`}
              onClick={() => setSetupStyle('recommended')}
            >
              <strong>Recommended</strong>
              <span className="muted">Balanced defaults for most personal workflows.</span>
            </button>
            <button
              type="button"
              className={`welcome-option ${setupStyle === 'private' ? 'selected' : ''}`}
              onClick={() => setSetupStyle('private')}
            >
              <strong>Private-first</strong>
              <span className="muted">Tighter local-only defaults and fewer external integrations.</span>
            </button>
            <button
              type="button"
              className={`welcome-option ${setupStyle === 'builder' ? 'selected' : ''}`}
              onClick={() => setSetupStyle('builder')}
            >
              <strong>Builder</strong>
              <span className="muted">More control over modules, runtime behavior, and observability.</span>
            </button>
            <div className="row gap-sm">
              <button type="button" className="primary-btn" onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="task-list">
            <h4>Pick your primary use cases</h4>
            <p className="muted">Select as many as you want.</p>
            <div className="capture-chips">
              {USE_CASE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`welcome-option ${useCases.includes(option) ? 'selected' : ''}`}
                  onClick={() => toggleUseCase(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="row gap-sm">
              <button type="button" className="primary-btn" onClick={() => setStep(4)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="task-list">
            <h4>Health check</h4>
            {healthLoading && (
              <div className="spinner-row">
                <span className="spinner" aria-hidden="true" />
                <span className="muted">Checking local services...</span>
              </div>
            )}
            {!healthLoading && (
              <div className="task-list">
                {healthChecks.map((check) => (
                  <div key={check.key} className="health-check-row">
                    <span className={`health-status-${check.status}`} aria-hidden="true" />
                    <div>
                      <strong>{check.title}</strong>
                      {check.detail && <p className="muted">{check.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="row gap-sm">
              <button type="button" className="primary-btn" onClick={() => setStep(5)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="task-list">
            <h4>Make your first capture</h4>
            <textarea
              rows={4}
              placeholder="Example: Plan this weekend around errands and one family activity"
              value={captureText}
              onChange={(event) => setCaptureText(event.target.value)}
            />
            <div className="row gap-sm">
              <button type="button" className="primary-btn" disabled={!canSubmitCapture} onClick={() => void submitFirstCapture()}>
                {captureSubmitting ? 'Saving...' : 'Finish setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
