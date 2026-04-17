import { useCallback, useEffect, useState } from 'react';

function getTourStorageKey(pageId: string): string {
  return `lifeos:tour:seen:${pageId}`;
}

export function usePageTour(
  pageId: string,
  hasData: boolean,
  totalSteps = 3,
): {
  tourActive: boolean;
  currentStep: number;
  totalSteps: number;
  advance: () => void;
  dismiss: () => void;
  reset: () => void;
} {
  const [tourActive, setTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const dismiss = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getTourStorageKey(pageId), 'true');
    }

    setTourActive(false);
  }, [pageId]);

  const advance = useCallback((): void => {
    if (currentStep >= totalSteps - 1) {
      dismiss();
      return;
    }

    setCurrentStep((step) => step + 1);
  }, [currentStep, dismiss, totalSteps]);

  const reset = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getTourStorageKey(pageId));
    }

    setCurrentStep(0);
    setTourActive(true);
  }, [pageId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const seen = window.localStorage.getItem(getTourStorageKey(pageId));
    if (!seen && hasData) {
      setCurrentStep(0);
      setTourActive(true);
    }
  }, [hasData, pageId]);

  useEffect(() => {
    if (!tourActive || typeof window === 'undefined') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss, tourActive]);

  return {
    tourActive,
    currentStep,
    totalSteps,
    advance,
    dismiss,
    reset,
  };
}