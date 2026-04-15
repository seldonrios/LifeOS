import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCapture } from '../ipc';

interface QuickCaptureOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function QuickCaptureOverlay({ open, onClose }: QuickCaptureOverlayProps): JSX.Element | null {
  const [captureText, setCaptureText] = useState('');
  const [captureConfirmed, setCaptureConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const captureMutation = useMutation({
    mutationFn: createCapture,
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['daily-review'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ]);
      setCaptureText('');
      setCaptureConfirmed(true);
      setTimeout(() => setCaptureConfirmed(false), 2_000);
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  function handleCaptureKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && captureText.trim()) {
      captureMutation.mutate(captureText.trim());
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="capture-overlay-backdrop" role="presentation" onClick={onClose}>
      <div className="capture-overlay-modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="capture-overlay-header">
          <h3>Quick Capture</h3>
          <button className="ghost-btn" type="button" aria-label="Close quick capture" onClick={onClose}>
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          className="capture-input"
          type="text"
          placeholder="Capture a task, thought, question, or reminder…"
          value={captureText}
          disabled={captureMutation.isPending}
          onChange={(event) => setCaptureText(event.target.value)}
          onKeyDown={handleCaptureKeyDown}
          aria-label="Quick capture"
        />

        {captureConfirmed && <span className="capture-confirm">Captured ✓</span>}

        <div className="capture-chips">
          <button className="ghost-btn" type="button">
            Add to inbox
          </button>
          <button className="ghost-btn" type="button">
            Set reminder
          </button>
          <button className="ghost-btn" type="button">
            Make a plan
          </button>
        </div>
      </div>
    </div>
  );
}
