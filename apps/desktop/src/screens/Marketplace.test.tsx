import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Marketplace } from './Marketplace';
import * as ipc from '../ipc';
import * as modulesHook from '../hooks/useModules';

vi.mock('../ipc', () => ({
  listMarketplace: vi.fn(),
}));

vi.mock('../hooks/useModules', () => ({
  useModules: vi.fn(),
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
      <Marketplace />
    </QueryClientProvider>,
  );
}

describe('Marketplace', () => {
  it('filters module cards by search term', async () => {
    vi.mocked(ipc.listMarketplace).mockResolvedValue([
      {
        id: 'research',
        repo: 'lifeos/research',
        description: 'Research assistant',
        category: 'assistant',
        resourceHint: 'High CPU',
        certified: true,
        installed: true,
      },
      {
        id: 'weather',
        repo: 'lifeos/weather',
        description: 'Weather snapshots',
        category: 'utility',
        resourceHint: 'Low CPU',
        certified: true,
        installed: false,
      },
    ]);

    vi.mocked(modulesHook.useModules).mockReturnValue({
      modulesQuery: { isLoading: false, error: null, data: [{ id: 'research', enabled: true }] },
      enableMutation: { mutateAsync: vi.fn() },
      disableMutation: { mutateAsync: vi.fn() },
    } as never);

    renderWithQueryClient();

    expect(await screen.findByText('research')).toBeInTheDocument();
    expect(await screen.findByText('weather')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search modules' }), {
      target: { value: 'weath' },
    });

    await waitFor(() => {
      expect(screen.queryByText('research')).not.toBeInTheDocument();
      expect(screen.getByText('weather')).toBeInTheDocument();
    });
  });

  it('calls enable mutation when enabling a disabled module', async () => {
    const enableMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const disableMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };

    vi.mocked(ipc.listMarketplace).mockResolvedValue([
      {
        id: 'weather',
        repo: 'lifeos/weather',
        description: 'Weather snapshots',
        category: 'utility',
        resourceHint: 'Low CPU',
        certified: true,
        installed: false,
      },
    ]);

    vi.mocked(modulesHook.useModules).mockReturnValue({
      modulesQuery: { isLoading: false, error: null, data: [] },
      enableMutation,
      disableMutation,
    } as never);

    renderWithQueryClient();

    fireEvent.click(await screen.findByRole('button', { name: 'Enable' }));

    await waitFor(() => {
      expect(enableMutation.mutateAsync).toHaveBeenCalledWith('weather');
      expect(disableMutation.mutateAsync).not.toHaveBeenCalled();
    });
  });
});
