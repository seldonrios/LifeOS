export * from './types';

import type { SchemaRegistryClient } from './types';

export function createSchemaRegistryClient(): SchemaRegistryClient {
  return {
    async registerSchema() {
      throw new Error('SchemaRegistryClient.registerSchema is not implemented.');
    },
    async getSchema() {
      throw new Error('SchemaRegistryClient.getSchema is not implemented.');
    },
    async validatePayload() {
      throw new Error('SchemaRegistryClient.validatePayload is not implemented.');
    },
    async register(entry) {
      return this.registerSchema(entry);
    },
    async lookup(eventType) {
      return this.getSchema(eventType);
    },
    async validate(eventType, data) {
      return this.validatePayload(eventType, data);
    },
  };
}
