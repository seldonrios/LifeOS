import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dashboard } from './Dashboard';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  listTasks: vi.fn(),
  completeTask: vi.fn(),
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
      <Dashboard />
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  it('renders tasks returned by IPC', async () => {
    vi.mocked(ipc.listTasks).mockResolvedValue([
      { id: 'task-1', title: 'Prepare board slides', dueDate: 'Fri' },
      { id: 'task-2', title: 'Review Q1 budget', dueDate: 'Overdue' },
    ]);

    renderWithQueryClient();

    expect(await screen.findByText("TODAY'S BRIEFING")).toBeInTheDocument();
    expect(await screen.findByText('Prepare board slides')).toBeInTheDocument();
    expect(await screen.findByText('Review Q1 budget')).toBeInTheDocument();
  });

  it('renders tasks returned by IPC mock mode', async () => {
    vi.mocked(ipc.listTasks).mockResolvedValue([
      { id: 'task-1', title: 'Prepare board slides', dueDate: 'Fri' },
    ]);
    vi.mocked(ipc.completeTask).mockResolvedValue({ result: { taskId: 'task-1' } });

    renderWithQueryClient();

    const doneButton = await screen.findByRole('button', { name: 'Fri' });
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(ipc.completeTask).toHaveBeenCalledWith('task-1');
      expect(ipc.listTasks).toHaveBeenCalledTimes(2);
    });
  });
});