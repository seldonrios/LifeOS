import { forwardRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LifeGraph } from './LifeGraph';
import * as graphHook from '../hooks/useGraph';

vi.mock('../hooks/useGraph', () => ({
  useGraph: vi.fn(),
}));

const forceGraphPropsSpy = vi.fn();

vi.mock('react-force-graph-2d', () => ({
  default: forwardRef<unknown, {
    graphData: { nodes: Array<{ id: string; label: string }>; links: unknown[] };
    onNodeClick?: (node: { id: string; label: string }) => void;
    onEngineStop?: () => void;
    minZoom?: number;
    maxZoom?: number;
  }>(({ graphData, onNodeClick, onEngineStop, minZoom, maxZoom }) => {
    forceGraphPropsSpy({ onEngineStop, minZoom, maxZoom, graphData });

    return (
      <div data-testid="force-graph">
        {graphData.nodes.map((node) => (
          <button key={node.id} type="button" onClick={() => onNodeClick?.(node)}>
            {node.label}
          </button>
        ))}
        <span data-testid="force-graph-link-count">{graphData.links.length}</span>
        <button type="button" onClick={() => onEngineStop?.()}>
          Stabilize graph
        </button>
      </div>
    );
  }),
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
      <LifeGraph />
    </QueryClientProvider>,
  );
}

describe('LifeGraph', () => {
  beforeEach(() => {
    forceGraphPropsSpy.mockClear();
  });

  it('prefers semantic links when relationship data is present', async () => {
    vi.mocked(graphHook.useGraph).mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        totalGoals: 3,
        totalPlans: 3,
        activeGoals: [
          { id: 'goal-1', title: 'Board meeting prep', completedTasks: 2, totalTasks: 5 },
          { id: 'goal-2', title: 'Q1 planning', completedTasks: 1, totalTasks: 3 },
          { id: 'goal-3', title: 'Hiring plan', completedTasks: 0, totalTasks: 4 },
        ],
        goalLinks: [{ source: 'goal-2', target: 'goal-3', relationship: 'depends-on' }],
      },
    } as never);

    renderWithQueryClient();

    expect(await screen.findByTestId('force-graph-link-count')).toHaveTextContent('1');
  });

  it('falls back to default links when semantic links are invalid', async () => {
    vi.mocked(graphHook.useGraph).mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        totalGoals: 3,
        totalPlans: 3,
        activeGoals: [
          { id: 'goal-1', title: 'Board meeting prep', completedTasks: 2, totalTasks: 5 },
          { id: 'goal-2', title: 'Q1 planning', completedTasks: 1, totalTasks: 3 },
          { id: 'goal-3', title: 'Hiring plan', completedTasks: 0, totalTasks: 4 },
        ],
        goalLinks: [
          { source: 'goal-2', target: 'goal-2', relationship: 'self-loop' },
          { source: 'missing', target: 'goal-3', relationship: 'invalid' },
        ],
      },
    } as never);

    renderWithQueryClient();

    expect(await screen.findByTestId('force-graph-link-count')).toHaveTextContent('2');
  });

  it('shows empty-state when there are no active goals', async () => {
    vi.mocked(graphHook.useGraph).mockReturnValue({
      isLoading: false,
      error: null,
      data: { totalGoals: 0, totalPlans: 0, activeGoals: [] },
    } as never);

    renderWithQueryClient();

    expect(await screen.findByText('No active goals in your graph.')).toBeInTheDocument();
    expect(screen.queryByTestId('force-graph')).not.toBeInTheDocument();
  });

  it('updates selected goal details when a graph node is clicked', async () => {
    vi.mocked(graphHook.useGraph).mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        totalGoals: 2,
        totalPlans: 2,
        activeGoals: [
          { id: 'goal-1', title: 'Board meeting prep', completedTasks: 2, totalTasks: 5 },
          { id: 'goal-2', title: 'Q1 planning', completedTasks: 1, totalTasks: 3 },
        ],
      },
    } as never);

    renderWithQueryClient();

    fireEvent.click(await screen.findByRole('button', { name: 'Board meeting prep' }));

    expect(await screen.findByRole('heading', { name: 'Board meeting prep' })).toBeInTheDocument();

    const progressBar = await screen.findByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '2');
    expect(progressBar).toHaveAttribute('aria-valuemax', '5');
    expect(screen.getByText(/tasks complete/i)).toBeInTheDocument();
  });

  it('normalizes malformed goal data before rendering details', async () => {
    vi.mocked(graphHook.useGraph).mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        totalGoals: 3,
        totalPlans: 3,
        activeGoals: [
          { id: 'goal-1', title: 'Board meeting prep', completedTasks: 8, totalTasks: 2 },
          { id: ' ', title: 'Invalid id', completedTasks: 1, totalTasks: 1 },
          { id: 'goal-1', title: 'Duplicate id', completedTasks: 0, totalTasks: 0 },
        ],
      },
    } as never);

    renderWithQueryClient();

    expect(await screen.findAllByRole('button', { name: 'Board meeting prep' })).toHaveLength(1);

    fireEvent.click(await screen.findByRole('button', { name: 'Board meeting prep' }));
    const progressBar = await screen.findByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '8');
    expect(progressBar).toHaveAttribute('aria-valuemax', '8');
  });

  it('applies graph camera limits and exposes engine-stop fit handler', async () => {
    vi.mocked(graphHook.useGraph).mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        totalGoals: 2,
        totalPlans: 2,
        activeGoals: [
          { id: 'goal-1', title: 'Board meeting prep', completedTasks: 2, totalTasks: 5 },
          { id: 'goal-2', title: 'Q1 planning', completedTasks: 1, totalTasks: 3 },
        ],
      },
    } as never);

    renderWithQueryClient();

    fireEvent.click(await screen.findByRole('button', { name: 'Stabilize graph' }));

    const latestCall = forceGraphPropsSpy.mock.calls.at(-1)?.[0] as
      | { minZoom?: number; maxZoom?: number; onEngineStop?: () => void }
      | undefined;
    expect(latestCall?.minZoom).toBe(0.35);
    expect(latestCall?.maxZoom).toBe(2.5);
    expect(typeof latestCall?.onEngineStop).toBe('function');
  });
});
