import { Coachmark } from './Coachmark';

interface FeatureTourProps {
  steps: ReadonlyArray<{ targetId: string; text: string }>;
  tourActive: boolean;
  currentStep: number;
  onAdvance: () => void;
  onSkip: () => void;
}

export function FeatureTour({
  steps,
  tourActive,
  currentStep,
  onAdvance,
  onSkip,
}: FeatureTourProps): JSX.Element | null {
  if (!tourActive) {
    return null;
  }

  const currentTourStep = steps[currentStep];
  if (!currentTourStep) {
    return null;
  }

  return (
    <Coachmark
      targetId={currentTourStep.targetId}
      text={currentTourStep.text}
      step={currentStep + 1}
      totalSteps={steps.length}
      onNext={onAdvance}
      onSkip={onSkip}
    />
  );
}