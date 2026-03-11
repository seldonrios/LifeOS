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

export class VoiceModule implements LifeOSModule {
  metadata: ModuleMetadata = {
    id: 'voice',
    name: 'Voice Module',
    version: '0.1.0',
    description: 'Executes speech-first command orchestration for LifeOS.',
    category: ModuleCategory.automation,
    permissions: [
      ModulePermission.EventPublish,
      ModulePermission.EventSubscribe,
      ModulePermission.DeviceControl,
      ModulePermission.LlmInvoke,
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
      rationale: `Voice orchestration cycle created for ${state.timestamp}.`,
      actions: [
        {
          id: 'voice-action-1',
          type: 'voice.session.plan',
          payload: {
            summary: state.summary,
          },
          priority: 6,
        },
      ],
    };
  }

  async act(action: PlannedAction): Promise<void> {
    void action;
    void this.context;
  }
}

export default new VoiceModule();
