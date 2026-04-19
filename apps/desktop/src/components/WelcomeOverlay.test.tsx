import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WelcomeOverlay } from './WelcomeOverlay';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  createCapture: vi.fn().mockResolvedValue({ id: 'test-capture' }),
  getUXHealth: vi.fn().mockResolvedValue([]),
  writeSettings: vi.fn().mockResolvedValue({
    model: 'llama3.1:8b',
    ollamaHost: 'http://127.0.0.1:11434',
    natsUrl: 'nats://127.0.0.1:4222',
    voiceEnabled: true,
    localOnlyMode: true,
    cloudAssistEnabled: false,
    trustAuditEnabled: true,
    transparencyTipsEnabled: true,
    setupStyle: undefined,
    useCases: undefined,
  }),
}));

const persistedSettings = {
  model: 'llama3.1:8b',
  ollamaHost: 'http://127.0.0.1:11434',
  natsUrl: 'nats://127.0.0.1:4222',
  voiceEnabled: true,
  localOnlyMode: true,
  cloudAssistEnabled: false,
  trustAuditEnabled: true,
  transparencyTipsEnabled: true,
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function clickThrough(setupStyle: 'private' | 'builder' | 'recommended'): Promise<void> {
  // Step 1 → 2
  fireEvent.click(screen.getByRole('button', { name: /get started/i }));

  // Step 2: select setup style then continue
  const styleLabel = setupStyle === 'private' ? /private-first/i : setupStyle === 'builder' ? /builder/i : /recommended/i;
  fireEvent.click(screen.getByRole('button', { name: styleLabel }));
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 3 → 4
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 4 → 5 (wait for health check UI to appear)
  await waitFor(() => screen.getByRole('button', { name: /continue/i }));
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 5: enter capture text and finish
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: 'My first capture' } });
  fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
}

describe('WelcomeOverlay', () => {
  it('waits for private-mode settings persistence before calling onComplete', async () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    const deferredSettings = createDeferred<Awaited<ReturnType<typeof ipc.writeSettings>>>();

    vi.mocked(ipc.writeSettings).mockReturnValueOnce(deferredSettings.promise);

    render(<WelcomeOverlay onComplete={onComplete} onSkip={onSkip} />);

    await clickThrough('private');

    await waitFor(() => {
      expect(ipc.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          setupStyle: 'private',
          useCases: expect.any(Array),
          localOnlyMode: true,
          cloudAssistEnabled: false,
        }),
      );
    });

    expect(onComplete).not.toHaveBeenCalled();

    deferredSettings.resolve({
      ...persistedSettings,
      setupStyle: 'private',
      useCases: ['privacy'],
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('waits for builder settings persistence before calling onComplete', async () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    const deferredSettings = createDeferred<Awaited<ReturnType<typeof ipc.writeSettings>>>();

    vi.mocked(ipc.writeSettings).mockReturnValueOnce(deferredSettings.promise);

    render(<WelcomeOverlay onComplete={onComplete} onSkip={onSkip} />);

    await clickThrough('builder');

    await waitFor(() => {
      expect(ipc.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          setupStyle: 'builder',
          useCases: expect.any(Array),
          transparencyTipsEnabled: true,
          trustAuditEnabled: true,
        }),
      );
    });

    expect(onComplete).not.toHaveBeenCalled();

    deferredSettings.resolve({
      ...persistedSettings,
      setupStyle: 'builder',
      useCases: ['automation'],
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
