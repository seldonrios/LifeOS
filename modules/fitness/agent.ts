import {
  LifeOSModule,
  ModuleContext,
  SystemEvent,
  LifeState,
  ModulePlan,
  PlannedAction,
  ModuleMetadata,
  ModuleCategory,
  ModulePermission,
} from '@lifeos/reasoning';

export class FitnessModule implements LifeOSModule {
  metadata: ModuleMetadata = {
    id: 'fitness',
    name: 'Fitness Module',
    version: '0.1.0',
    description: 'Tracks health signals and proposes actionable fitness plans.',
    category: ModuleCategory.health,
    permissions: [
      ModulePermission.LifeGraphRead,
      ModulePermission.LifeGraphWrite,
      ModulePermission.EventPublish,
      ModulePermission.EventSubscribe,
    ],
  };

  private context: ModuleContext | null = null;

  async init(context: ModuleContext): Promise<void> {
    this.context = context;
  }

  async observe(event: SystemEvent): Promise<void> {
    void event;
  }

  async plan(state: LifeState): Promise<ModulePlan | null> {
    return {
      moduleId: this.metadata.id,
      rationale: `Fitness baseline plan created for ${state.timestamp}.`,
      actions: [
        {
          id: 'fitness-action-1',
          type: 'fitness.plan.refresh',
          payload: {
            summary: state.summary,
          },
          priority: 5,
        },
      ],
    };
  }

  async act(action: PlannedAction): Promise<void> {
    void action;
    void this.context;
  }
}

export default new FitnessModule();
