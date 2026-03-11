export * from './types';

import type { PolicyClient } from './types';

export function createPolicyClient(): PolicyClient {
  return {
    async evaluatePolicy() {
      throw new Error('PolicyClient.evaluatePolicy is not implemented.');
    },
    checkPermission() {
      throw new Error('PolicyClient.checkPermission is not implemented.');
    },
    async evaluate(request) {
      return this.evaluatePolicy(request);
    },
  };
}
