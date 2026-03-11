export interface FeatureFlag {
  id: string;
  enabled: boolean;
  profileDefaults: Record<string, boolean>;
  description?: string;
}

export interface EvaluationContext {
  profile: string;
  [key: string]: unknown;
}
