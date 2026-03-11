export * from './types';

import type { PolicyClient } from './types';

export function createPolicyClient(): PolicyClient {
  return {
    async evaluatePolicy() {
      throw new Error('PolicyClient.evaluatePolicy is not implemented.');
    },
    checkPermission() {
      return false;
    },
    async evaluate(request) {
      return this.evaluatePolicy(request);
    },
  };
}
