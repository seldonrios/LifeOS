import { MobileCoachmark } from './MobileCoachmark';

interface MobileFeatureTourProps {
  steps: ReadonlyArray<{ text: string }>;
  tourActive: boolean;
  currentStep: number;
  onAdvance: () => void;
  onSkip: () => void;
}

export function MobileFeatureTour({
  steps,
  tourActive,
  currentStep,
  onAdvance,
  onSkip,
}: MobileFeatureTourProps): JSX.Element | null {
  if (!tourActive) {
    return null;
  }

  const currentTourStep = steps[currentStep];
  if (!currentTourStep) {
    return null;
  }

  return (
    <MobileCoachmark
      text={currentTourStep.text}
      step={currentStep + 1}
      totalSteps={steps.length}
      onNext={onAdvance}
      onSkip={onSkip}
    />
  );
}