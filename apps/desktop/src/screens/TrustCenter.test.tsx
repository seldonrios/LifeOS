import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TrustCenter } from './TrustCenter';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  readTrustStatus: vi.fn(),
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
      <TrustCenter />
    </QueryClientProvider>,
  );
}

describe('TrustCenter', () => {
  it('renders trust ownership summary from IPC', async () => {
    vi.mocked(ipc.readTrustStatus).mockResolvedValue({
      generatedAt: new Date().toISOString(),
      ownership: {
        dataOwnership: 'Your data is yours.',
        methodsTransparency: 'Methods are inspectable.',
        localFirstDefault: true,
        cloudAssistEnabled: false,
      },
      runtime: {
        model: 'llama3.1:8b',
        ollamaHost: 'http://127.0.0.1:11434',
        natsUrl: 'nats://127.0.0.1:4222',
        localOnlyMode: true,
        trustAuditEnabled: true,
        policyEnforced: true,
        moduleManifestRequired: true,
        moduleRuntimePermissions: 'strict',
      },
      modules: [
        {
          id: 'calendar',
          tier: 'core',
          enabled: true,
          available: true,
          permissions: {
            graph: ['read', 'append'],
            voice: [],
            network: [],
            events: ['subscribe:lifeos.voice.intent.calendar.add'],
          },
        },
      ],
      recentDecisions: [
        {
          at: new Date().toISOString(),
          category: 'ownership',
          message: 'Local-only mode is enabled; cloud assist is opt-in.',
        },
      ],
    });

    renderWithQueryClient();

    expect(await screen.findByRole('heading', { name: 'OWNERSHIP SUMMARY' })).toBeInTheDocument();
    expect(await screen.findByText(/Your data is yours/i)).toBeInTheDocument();
    expect(await screen.findByText(/calendar/i)).toBeInTheDocument();
  });
});
