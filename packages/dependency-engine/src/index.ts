export * from './types';

import type { DependencyEngineClient } from './types';

export function createDependencyEngine(): DependencyEngineClient {
  throw new Error('createDependencyEngine is not implemented.');
}
