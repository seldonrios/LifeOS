export * from './types';

import type { ServiceRuntime, ServiceRuntimeOptions } from './types';

export async function startService(opts: ServiceRuntimeOptions): Promise<ServiceRuntime> {
  void opts;
  throw new Error('startService is not implemented.');
}
