import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Memory } from './Memory';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  listMemory: vi.fn(),
}));

const STUB_ENTRIES: ipc.MemoryEntry[] = [
  {
    id: 'memory-typed-1',
    content: 'Remember to pick up compost bags from the hardware store this weekend.',
    capturedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    type: 'text',
    tags: ['household', 'shopping'],
  },
  {
    id: 'memory-voice-1',
    content: 'Voice note: ask Alex about rescheduling the Thursday dentist appointment.',
    capturedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    type: 'voice',
    tags: ['health', 'follow-up'],
  },
  {
    id: 'memory-note-1',
    content: 'Plan spring garden prep: seed trays, soil refresh, and watering schedule.',
    capturedAt: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(),
    type: 'note',
    tags: ['homesteading', 'planning'],
  },
];

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
      <Memory />
    </QueryClientProvider>,
  );
}

describe('Memory', () => {
  it('renders capture list', async () => {
    vi.mocked(ipc.listMemory).mockResolvedValue(STUB_ENTRIES);
    renderWithQueryClient();

    expect(await screen.findByText(STUB_ENTRIES[0].content)).toBeInTheDocument();
    expect(await screen.findByText(STUB_ENTRIES[1].content)).toBeInTheDocument();
    expect(await screen.findByText(STUB_ENTRIES[2].content)).toBeInTheDocument();
    expect(vi.mocked(ipc.listMemory)).toHaveBeenCalledWith();
  });

  it('search filters results', async () => {
    vi.mocked(ipc.listMemory).mockResolvedValue(STUB_ENTRIES);
    renderWithQueryClient();

    // Wait for data to load
    await screen.findByText(STUB_ENTRIES[0].content);

    const searchInput = screen.getByPlaceholderText('Search your captures…');
    fireEvent.change(searchInput, { target: { value: 'compost' } });

    expect(screen.getByText(STUB_ENTRIES[0].content)).toBeInTheDocument();
    expect(screen.queryByText(STUB_ENTRIES[1].content)).not.toBeInTheDocument();
    expect(screen.queryByText(STUB_ENTRIES[2].content)).not.toBeInTheDocument();
  });

  it('shows empty state when no captures exist', async () => {
    vi.mocked(ipc.listMemory).mockResolvedValue([]);
    renderWithQueryClient();

    expect(
      await screen.findByText(/Nothing captured yet\. Use Quick Capture to add your first thought\./),
    ).toBeInTheDocument();
  });

  it('shows empty state when search has no matches', async () => {
    vi.mocked(ipc.listMemory).mockResolvedValue(STUB_ENTRIES);
    renderWithQueryClient();

    await screen.findByText(STUB_ENTRIES[0].content);

    const searchInput = screen.getByPlaceholderText('Search your captures…');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.getByText('No captures match your search.')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    vi.mocked(ipc.listMemory).mockReturnValue(new Promise(() => {}));
    renderWithQueryClient();

    expect(screen.getByText('Loading your captures…')).toBeInTheDocument();
    expect(screen.queryByText(STUB_ENTRIES[0].content)).not.toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(ipc.listMemory).mockRejectedValue(new Error('network error'));
    renderWithQueryClient();

    expect(
      await screen.findByText(/Something went wrong loading your captures\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
