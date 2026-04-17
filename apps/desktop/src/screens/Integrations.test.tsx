import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Integrations } from './Integrations';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  listIntegrations: vi.fn(),
  listMarketplace: vi.fn(),
  listModules: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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
      <Integrations />
    </QueryClientProvider>,
  );
}

const connectedRow = {
  id: 'google',
  label: 'Google',
  connected: true,
  expiresAt: '2026-05-01',
  cliCommand: 'lifeos connect google',
};

const disconnectedRow = {
  id: 'home-assistant',
  label: 'Home Assistant',
  connected: false,
  expiresAt: null,
  cliCommand: 'lifeos connect home-assistant',
};

const stubMarketplace = [
  {
    id: 'weather',
    description: 'Weather module',
    repo: 'https://github.com/example/weather',
    tier: 'community',
    tags: [],
  },
];

const stubModules = [
  { id: 'weather', tier: 'community', enabled: false, available: true, subFeatures: [] },
];

describe('Integrations', () => {
  it('Service Connections section renders with both rows', async () => {
    vi.mocked(ipc.listIntegrations).mockResolvedValue([connectedRow, disconnectedRow]);
    vi.mocked(ipc.listMarketplace).mockResolvedValue(stubMarketplace);
    vi.mocked(ipc.listModules).mockResolvedValue(stubModules);

    renderWithQueryClient();

    expect(await screen.findByText('Service Connections')).toBeInTheDocument();
    expect(await screen.findByText('Google')).toBeInTheDocument();
    expect(await screen.findByText('Home Assistant')).toBeInTheDocument();
  });

  it('connected row shows Connected status', async () => {
    vi.mocked(ipc.listIntegrations).mockResolvedValue([connectedRow]);
    vi.mocked(ipc.listMarketplace).mockResolvedValue([]);
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(await screen.findByText('Connected')).toBeInTheDocument();
  });

  it('disconnected row shows Connect via CLI button', async () => {
    vi.mocked(ipc.listIntegrations).mockResolvedValue([disconnectedRow]);
    vi.mocked(ipc.listMarketplace).mockResolvedValue([]);
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(
      await screen.findByTestId('connect-btn-home-assistant'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('connect-btn-home-assistant')).toHaveTextContent(
      'Connect via CLI',
    );
  });

  it('Connect via CLI button copies command to clipboard', async () => {
    vi.mocked(ipc.listIntegrations).mockResolvedValue([disconnectedRow]);
    vi.mocked(ipc.listMarketplace).mockResolvedValue([]);
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    // navigator.clipboard is polyfilled in setup.ts; just reset and assert
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    renderWithQueryClient();

    const btn = await screen.findByTestId('connect-btn-home-assistant');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'lifeos connect home-assistant',
      );
    });
  });

  it('Marketplace sub-section renders', async () => {
    vi.mocked(ipc.listIntegrations).mockResolvedValue([]);
    vi.mocked(ipc.listMarketplace).mockResolvedValue(stubMarketplace);
    vi.mocked(ipc.listModules).mockResolvedValue(stubModules);

    renderWithQueryClient();

    expect(await screen.findByText('Module Marketplace')).toBeInTheDocument();
  });

  it('error state shows error message and Retry button', async () => {
    vi.mocked(ipc.listIntegrations).mockRejectedValue(new Error('Network error'));
    vi.mocked(ipc.listMarketplace).mockResolvedValue([]);
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(
      await screen.findByText('Could not load integration status.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('loading state shows spinner', async () => {
    vi.mocked(ipc.listIntegrations).mockReturnValue(new Promise(() => {}));
    vi.mocked(ipc.listMarketplace).mockResolvedValue([]);
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(await screen.findByText('Loading connections...')).toBeInTheDocument();
  });
});
