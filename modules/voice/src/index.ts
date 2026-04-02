import { Topics, type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';

import { emissions, subscriptions } from '../events';

function isRetainAudioEnabled(context: ModuleRuntimeContext): boolean {
  return context.env.LIFEOS_HOME_NODE_VOICE_RETAIN_AUDIO === 'true';
}

async function subscribeToVoiceLifecycle(context: ModuleRuntimeContext): Promise<void> {
  await context.subscribe<Record<string, unknown>>(
    Topics.lifeos.homeNodeVoiceSessionStarted,
    async (event) => {
      context.log(`[voice] session started ${JSON.stringify(event.data)}`);
    },
  );

  await context.subscribe<Record<string, unknown>>(
    Topics.lifeos.homeNodeVoiceSessionCompleted,
    async (event) => {
      context.log(`[voice] session completed ${JSON.stringify(event.data)}`);
      if (!isRetainAudioEnabled(context)) {
        context.log('[voice] audio is not retained');
      }
    },
  );

  await context.subscribe<Record<string, unknown>>(
    Topics.lifeos.homeNodeVoiceSessionFailed,
    async (event) => {
      context.log(`[voice] session failed ${JSON.stringify(event.data)}`);
    },
  );

  await context.subscribe<Record<string, unknown>>(
    Topics.lifeos.householdVoiceCaptureCreated,
    async (event) => {
      context.log(`[voice] observed capture ${JSON.stringify(event.data)}`);
    },
  );
}

export const voiceModule: LifeOSModule = {
  id: 'voice',
  async init(context: ModuleRuntimeContext): Promise<void> {
    const retainAudio = isRetainAudioEnabled(context);

    await subscribeToVoiceLifecycle(context);

    context.log(
      `[voice] initialized, retainAudio=${retainAudio}, subscriptions=${subscriptions.length}, emissions=${emissions.length}`,
    );
  },
};

export default voiceModule;