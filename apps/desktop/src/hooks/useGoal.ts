import { useMutation } from '@tanstack/react-query';
import { runGoal } from '../ipc';

export function useGoal() {
  return useMutation({
    mutationFn: ({ goal, model }: { goal: string; model: string }) => runGoal(goal, model),
  });
}
