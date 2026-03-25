import { useQuery } from '@tanstack/react-query';
import { getGraphSummary } from '../ipc';

export function useGraph() {
  return useQuery({
    queryKey: ['graph-summary'],
    queryFn: getGraphSummary,
    staleTime: 10_000,
  });
}
