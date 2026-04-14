import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Today } from './Today';
import * as ipc from '../ipc';

vi.mock('../ipc', () => ({
  listTasks: vi.fn(),
  completeTask: vi.fn(),
  getGraphSummary: vi.fn(),
  getDailyReview: vi.fn(),
  createCapture: vi.fn(),
  listModules: vi.fn(),
}));

const defaultOnNavigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  defaultOnNavigate.mockReset();
});

function renderWithQueryClient(onNavigate = defaultOnNavigate): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Today onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
}

function setupDefaultMocks(): void {
  vi.mocked(ipc.listTasks).mockResolvedValue([
    { id: 'task-1', title: 'Prepare board slides', dueDate: 'Fri' },
    { id: 'task-2', title: 'Review Q1 budget', dueDate: 'Overdue' },
  ]);
  vi.mocked(ipc.getGraphSummary).mockResolvedValue({
    totalGoals: 2,
    totalPlans: 1,
    activeGoals: [{ id: 'goal-1', title: 'Board meeting prep', completedTasks: 2, totalTasks: 5 }],
  });
  vi.mocked(ipc.getDailyReview).mockResolvedValue({
    pendingCaptures: 2,
    actionsDueToday: 1,
    unacknowledgedReminders: 1,
    completedActions: [],
  });
  vi.mocked(ipc.listModules).mockResolvedValue([
    { id: 'scheduler', tier: 'core', enabled: true, available: true, subFeatures: [] },
    { id: 'notes', tier: 'core', enabled: true, available: true, subFeatures: [] },
  ]);
  vi.mocked(ipc.completeTask).mockResolvedValue({ result: { taskId: 'task-1' } });
  vi.mocked(ipc.createCapture).mockResolvedValue({ id: 'mock-capture-123' });
}

describe('Today', () => {
  it('renders all four card labels', async () => {
    setupDefaultMocks();
    renderWithQueryClient();

    expect(await screen.findByText('NEXT UP')).toBeInTheDocument();
    expect(await screen.findByText('AWAITING TRIAGE')).toBeInTheDocument();
    expect(await screen.findByText('SUGGESTED PLAN')).toBeInTheDocument();
    expect(await screen.findByText('REMINDERS TODAY')).toBeInTheDocument();
  });

  it('trust indicator is always visible', async () => {
    // Keep tasks loading indefinitely to test trust bar is visible before data arrives
    vi.mocked(ipc.listTasks).mockReturnValue(new Promise(() => {}));
    vi.mocked(ipc.getGraphSummary).mockResolvedValue({ totalGoals: 0, totalPlans: 0 });
    vi.mocked(ipc.getDailyReview).mockReturnValue(new Promise(() => {}));
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(await screen.findByText('Local only')).toBeInTheDocument();
    expect(screen.getByText(/services connected/)).toBeInTheDocument();
  });

  it('quick capture submits and clears input', async () => {
    setupDefaultMocks();
    renderWithQueryClient();

    const input = await screen.findByPlaceholderText(
      '+ Capture a task, thought, question, or reminder…',
    );

    fireEvent.change(input, { target: { value: 'buy milk' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(ipc.createCapture).toHaveBeenCalledWith('buy milk');
    });

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  it('renders empty state when all data is clear', async () => {
    vi.mocked(ipc.listTasks).mockResolvedValue([]);
    vi.mocked(ipc.getGraphSummary).mockResolvedValue({
      totalGoals: 0,
      totalPlans: 0,
      activeGoals: [],
    });
    vi.mocked(ipc.getDailyReview).mockResolvedValue({
      pendingCaptures: 0,
      actionsDueToday: 0,
      unacknowledgedReminders: 0,
      completedActions: [],
    });
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(await screen.findByText("You're all clear right now.")).toBeInTheDocument();
  });

  it('does not render empty state until graph query resolves', async () => {
    vi.mocked(ipc.listTasks).mockResolvedValue([]);
    vi.mocked(ipc.getDailyReview).mockResolvedValue({
      pendingCaptures: 0,
      actionsDueToday: 0,
      unacknowledgedReminders: 0,
      completedActions: [],
    });
    vi.mocked(ipc.getGraphSummary).mockReturnValue(new Promise(() => {}));
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(screen.queryByText("You're all clear right now.")).not.toBeInTheDocument();
    expect(await screen.findByText('NEXT UP')).toBeInTheDocument();
  });

  it('error state uses plain language message', async () => {
    vi.mocked(ipc.listTasks).mockRejectedValue(new Error('Network error'));
    vi.mocked(ipc.getGraphSummary).mockResolvedValue({ totalGoals: 0, totalPlans: 0 });
    vi.mocked(ipc.getDailyReview).mockResolvedValue({
      pendingCaptures: 0,
      actionsDueToday: 0,
      unacknowledgedReminders: 0,
      completedActions: [],
    });
    vi.mocked(ipc.listModules).mockResolvedValue([]);

    renderWithQueryClient();

    expect(
      await screen.findByText(
        /LifeOS couldn't load your tasks right now\. You can still capture items and check back shortly\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Unable to load dashboard tasks.')).not.toBeInTheDocument();
  });

  it('mark done calls completeTask and refetches', async () => {
    setupDefaultMocks();
    renderWithQueryClient();

    const doneButton = (await screen.findAllByRole('button', { name: 'Mark done' }))[0];
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(ipc.completeTask).toHaveBeenCalledWith('task-1');
      expect(ipc.listTasks).toHaveBeenCalledTimes(2);
    });
  });
});
