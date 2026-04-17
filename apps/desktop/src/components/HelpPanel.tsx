import { useEffect, useState } from 'react';
import type { ScreenId } from '../types';

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
  onReplayOnboarding: () => void;
  activeScreen: ScreenId;
  onShowWalkthrough: () => void;
}

type HelpView = 'menu' | 'shortcuts' | 'about';

const ABOUT_SLIDES = [
  {
    title: 'LifeOS is your local command center',
    body: 'LifeOS keeps your plans, reminders, and memory in one place with local-first defaults.',
  },
  {
    title: 'Designed for calm execution',
    body: 'Capture quickly, review daily, and keep momentum with clear next actions.',
  },
  {
    title: 'Trust through transparency',
    body: 'Core runtime settings and module behavior stay visible so you can inspect what is happening.',
  },
];

export function HelpPanel({
  open,
  onClose,
  onReplayOnboarding,
  activeScreen,
  onShowWalkthrough,
}: HelpPanelProps): JSX.Element | null {
  const [view, setView] = useState<HelpView>('menu');
  const [aboutSlide, setAboutSlide] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setView('menu');
      setAboutSlide(0);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="help-panel-backdrop" role="presentation" onClick={onClose}>
      <div className="help-panel card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="capture-overlay-header">
          <h3>Help</h3>
          <button className="ghost-btn" type="button" aria-label="Close help" onClick={onClose}>
            ×
          </button>
        </div>

        {view === 'menu' && (
          <div className="task-list">
            <button
              type="button"
              className="help-entry-btn"
              aria-label="Help"
              onClick={() => {
                onShowWalkthrough();
                onClose();
              }}
            >
              <span className="nav-icon" aria-hidden="true">◎</span>
              Show walkthrough for this page
            </button>
            <button
              type="button"
              className="help-entry-btn"
              onClick={() => setView('shortcuts')}
            >
              <span className="nav-icon" aria-hidden="true">⌘</span>
              Keyboard shortcuts
            </button>
            <button
              type="button"
              className="help-entry-btn"
              onClick={() => setView('about')}
            >
              <span className="nav-icon" aria-hidden="true">i</span>
              What is LifeOS?
            </button>
            <button
              type="button"
              className="help-entry-btn"
              onClick={onReplayOnboarding}
            >
              <span className="nav-icon" aria-hidden="true">↺</span>
              Replay onboarding
            </button>
          </div>
        )}

        {view === 'shortcuts' && (
          <div className="task-list">
            <div className="row space-between">
              <h4>Keyboard shortcuts</h4>
              <button type="button" className="ghost-btn" onClick={() => setView('menu')}>
                Back
              </button>
            </div>
            <div className="item-row">
              <strong>Cmd/Ctrl+K</strong>
              <span className="muted">Quick capture</span>
            </div>
            <div className="item-row">
              <strong>Esc</strong>
              <span className="muted">Close overlay</span>
            </div>
            <div className="item-row">
              <strong>1-7</strong>
              <span className="muted">Nav shortcuts</span>
            </div>
          </div>
        )}

        {view === 'about' && (
          <div className="task-list">
            <div className="row space-between">
              <h4>What is LifeOS?</h4>
              <button type="button" className="ghost-btn" onClick={() => setView('menu')}>
                Back
              </button>
            </div>
            <p className="muted">Slide {aboutSlide + 1} of {ABOUT_SLIDES.length}</p>
            <div className="card">
              <h4>{ABOUT_SLIDES[aboutSlide].title}</h4>
              <p>{ABOUT_SLIDES[aboutSlide].body}</p>
            </div>
            <div className="row gap-sm">
              <button
                type="button"
                className="secondary-btn"
                disabled={aboutSlide === 0}
                onClick={() => setAboutSlide((slide) => Math.max(0, slide - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={aboutSlide === ABOUT_SLIDES.length - 1}
                onClick={() => setAboutSlide((slide) => Math.min(ABOUT_SLIDES.length - 1, slide + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
