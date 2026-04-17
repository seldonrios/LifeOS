import AsyncStorage from '@react-native-async-storage/async-storage';
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
    void AsyncStorage.setItem(getTourStorageKey(pageId), 'true');
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
    void AsyncStorage.removeItem(getTourStorageKey(pageId));
    setCurrentStep(0);
    setTourActive(true);
  }, [pageId]);

  useEffect(() => {
    let isMounted = true;

    const readSeenState = async (): Promise<void> => {
      const seen = await AsyncStorage.getItem(getTourStorageKey(pageId));
      if (!isMounted || seen || !hasData) {
        return;
      }

      setCurrentStep(0);
      setTourActive(true);
    };

    void readSeenState();

    return () => {
      isMounted = false;
    };
  }, [hasData, pageId]);

  return {
    tourActive,
    currentStep,
    totalSteps,
    advance,
    dismiss,
    reset,
  };
}