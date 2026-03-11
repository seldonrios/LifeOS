export * from './types';

import type { EventBus } from './types';

export function createEventBusClient(): EventBus {
  throw new Error('createEventBusClient is not implemented.');
}

export async function bootstrapStreams(): Promise<void> {
  throw new Error('bootstrapStreams is not implemented.');
}
