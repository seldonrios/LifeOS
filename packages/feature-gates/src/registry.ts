import type { EvaluationContext, FeatureFlag } from './types';

export class FeatureGateRegistry {
  private readonly flags = new Map<string, FeatureFlag>();

  constructor(initialFlags: FeatureFlag[] = []) {
    this.load(initialFlags);
  }

  load(flags: FeatureFlag[]): void {
    this.flags.clear();
    for (const flag of flags) {
      this.flags.set(flag.id, flag);
    }
  }

  isEnabled(flagId: string, context: EvaluationContext): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) {
      return false;
    }

    const profileOverride = flag.profileDefaults[context.profile];
    if (typeof profileOverride === 'boolean') {
      return profileOverride;
    }

    return flag.enabled;
  }

  check(flagId: string, context: EvaluationContext): FeatureFlag | undefined {
    void context;
    return this.flags.get(flagId);
  }
}
