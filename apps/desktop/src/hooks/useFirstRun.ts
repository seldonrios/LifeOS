import { useCallback, useState } from 'react';

const ONBOARDING_COMPLETE_KEY = 'lifeos:onboarding:complete';

function readIsFirstRun(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) !== 'true';
}

export function useFirstRun(): {
  isFirstRun: boolean;
  markComplete: () => void;
  resetOnboarding: () => void;
} {
  const [isFirstRun, setIsFirstRun] = useState<boolean>(() => readIsFirstRun());

  const markComplete = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    }
    setIsFirstRun(false);
  }, []);

  const resetOnboarding = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    }
    setIsFirstRun(true);
  }, []);

  return {
    isFirstRun,
    markComplete,
    resetOnboarding,
  };
}
