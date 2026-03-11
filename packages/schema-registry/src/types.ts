import type { EventCategory } from '@lifeos/event-bus';

export interface SchemaChangelogEntry {
  version: string;
  changes: string;
  date: string;
}

export interface SchemaEntry {
  event_type: string;
  version: string;
  category: EventCategory;
  producer: string;
  data_schema: Record<string, unknown>;
  permission_scope: string;
  changelog: SchemaChangelogEntry[];
}

export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface SchemaRegistryClient {
  registerSchema(entry: SchemaEntry): Promise<void>;
  getSchema(eventType: string): Promise<SchemaEntry | null>;
  validatePayload(eventType: string, data: unknown): Promise<boolean>;
  /** @deprecated Use registerSchema instead. */
  register(entry: SchemaEntry): Promise<void>;
  /** @deprecated Use getSchema instead. */
  lookup(eventType: string): Promise<SchemaEntry | null>;
  /** @deprecated Use validatePayload instead. */
  validate(eventType: string, data: unknown): Promise<boolean>;
}
