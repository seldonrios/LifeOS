import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disableModule, enableModule, listModules } from '../ipc';

export function useModules() {
  const queryClient = useQueryClient();

  const modulesQuery = useQuery({
    queryKey: ['modules'],
    queryFn: listModules,
    staleTime: 10_000,
  });

  const enableMutation = useMutation({
    mutationFn: enableModule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: disableModule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  return {
    modulesQuery,
    enableMutation,
    disableMutation,
  };
}
