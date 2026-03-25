import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Settings } from './Settings';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
  listOllamaModels: vi.fn(),
}));

function renderWithQueryClient(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Settings />
    </QueryClientProvider>,
  );
}

describe('Settings', () => {
  it('renders hydrated settings values from IPC', async () => {
    vi.mocked(ipc.readSettings).mockResolvedValue({
      model: 'llama3.1:8b',
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
    });
    vi.mocked(ipc.listOllamaModels).mockResolvedValue(['llama3.1:8b', 'mistral:7b']);

    renderWithQueryClient();

    expect(await screen.findByRole('heading', { name: 'AI MODEL' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('llama3.1:8b')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('http://127.0.0.1:11434')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('nats://127.0.0.1:4222')).toBeInTheDocument();
    expect(await screen.findByLabelText('Voice assistant')).toBeChecked();
  });

  it('writes updated settings payload when save is clicked', async () => {
    vi.mocked(ipc.readSettings).mockResolvedValue({
      model: 'llama3.1:8b',
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
    });
    vi.mocked(ipc.listOllamaModels).mockResolvedValue(['llama3.1:8b', 'mistral:7b']);
    vi.mocked(ipc.writeSettings).mockResolvedValue({
      model: 'mistral:7b',
      ollamaHost: 'http://localhost:11434',
      natsUrl: 'nats://localhost:4222',
      voiceEnabled: false,
    });

    renderWithQueryClient();

    const modelSelect = await screen.findByLabelText('Model');
    const hostInput = await screen.findByLabelText('Ollama host');
    const natsInput = await screen.findByLabelText('NATS URL');
    const voiceCheckbox = await screen.findByLabelText('Voice assistant');

    fireEvent.change(modelSelect, { target: { value: 'mistral:7b' } });
    fireEvent.change(hostInput, { target: { value: 'http://localhost:11434' } });
    fireEvent.change(natsInput, { target: { value: 'nats://localhost:4222' } });
    fireEvent.click(voiceCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(ipc.writeSettings).toHaveBeenCalled();
      const [payload] = vi.mocked(ipc.writeSettings).mock.calls[0] ?? [];
      expect(payload).toEqual({
        model: 'mistral:7b',
        ollamaHost: 'http://localhost:11434',
        natsUrl: 'nats://localhost:4222',
        voiceEnabled: false,
      });
    });
  });

  it('reverts unsaved changes to last loaded values', async () => {
    vi.mocked(ipc.readSettings).mockResolvedValue({
      model: 'llama3.1:8b',
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
    });
    vi.mocked(ipc.listOllamaModels).mockResolvedValue(['llama3.1:8b']);

    renderWithQueryClient();

    const hostInput = (await screen.findByLabelText('Ollama host')) as HTMLInputElement;
    fireEvent.change(hostInput, { target: { value: 'http://localhost:11434' } });
    expect(hostInput.value).toBe('http://localhost:11434');

    fireEvent.click(screen.getAllByRole('button', { name: 'Revert' })[0]);
    await waitFor(() => {
      expect(hostInput.value).toBe('http://127.0.0.1:11434');
    });
  });

  it('disables model selection when Ollama models cannot be loaded', async () => {
    vi.mocked(ipc.readSettings).mockResolvedValue({
      model: 'llama3.1:8b',
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
    });
    vi.mocked(ipc.listOllamaModels).mockResolvedValue([]);

    renderWithQueryClient();

    const modelSelect = (await screen.findByLabelText('Model')) as HTMLSelectElement;
    expect(modelSelect).toBeDisabled();
    expect(await screen.findByRole('option', { name: 'Ollama not reachable - check host' })).toBeInTheDocument();
  });

  it('shows stale saved model when not present in live Ollama list', async () => {
    vi.mocked(ipc.readSettings).mockResolvedValue({
      model: 'gemma3:12b',
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
    });
    vi.mocked(ipc.listOllamaModels).mockResolvedValue(['llama3.1:8b', 'qwen3:8b']);

    renderWithQueryClient();

    expect(await screen.findByRole('option', { name: '⚠️ gemma3:12b (saved, not installed)' })).toBeInTheDocument();
    const modelSelect = (await screen.findByLabelText('Model')) as HTMLSelectElement;
    expect(modelSelect.value).toBe('gemma3:12b');
  });
});
