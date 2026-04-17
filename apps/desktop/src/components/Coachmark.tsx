import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';

interface CoachmarkProps {
  targetId: string;
  text: string;
  step: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

export function Coachmark({
  targetId,
  text,
  step,
  totalSteps,
  onNext,
  onSkip,
}: CoachmarkProps): JSX.Element | null {
  const coachmarkRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const updatePosition = (): void => {
      const target = document.getElementById(targetId);
      if (!target) {
        setStyle(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const margin = 16;
      const width = Math.min(360, Math.max(280, window.innerWidth - margin * 2));
      const height = coachmarkRef.current?.offsetHeight ?? 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= height + 12
          ? rect.bottom + window.scrollY + 12
          : Math.max(window.scrollY + margin, rect.top + window.scrollY - height - 12);
      const left = Math.min(
        Math.max(window.scrollX + margin, rect.left + window.scrollX),
        window.scrollX + window.innerWidth - width - margin,
      );

      setStyle({
        position: 'absolute',
        top,
        left,
        width,
        zIndex: 50,
        borderRadius: 16,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: '#0f172a',
        color: '#f8fafc',
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.28)',
        padding: '16px',
      });
    };

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
    };
  }, [targetId, text]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent): void => {
      if (coachmarkRef.current?.contains(event.target as Node)) {
        return;
      }

      onSkip();
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onSkip]);

  if (style === null) {
    return null;
  }

  return (
    <div
      ref={coachmarkRef}
      role="tooltip"
      id={`coachmark-${step}`}
      tabIndex={-1}
      style={style}
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
    >
      <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Step {step} of {totalSteps}
      </div>
      <p style={{ margin: '12px 0 16px', fontSize: '14px', lineHeight: 1.5 }}>{text}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <button
          type="button"
          className="primary-btn"
          tabIndex={-1}
          onClick={onNext}
        >
          Got it →
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={onSkip}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#cbd5e1',
            cursor: 'pointer',
            fontSize: '13px',
            padding: 0,
          }}
        >
          Skip tour
        </button>
      </div>
    </div>
  );
}