import type { LifeOSModule } from '@lifeos/module-sdk';

export const templateModule: LifeOSModule = {
  id: 'template-module',
  async init(context) {
    await context.subscribe('lifeos.tick.overdue', async () => {
      await context.publish('lifeos.template-module.handled', { ok: true }, 'template-module');
    });
  },
};
