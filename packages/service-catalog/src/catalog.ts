import type { CapabilityBinding, CatalogEntry } from './types';
import type { EventBus } from '@lifeos/event-bus';

import { createCatalogEventPublisher } from './events';

export class ServiceCatalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly bindings = new Map<string, CapabilityBinding[]>();

  register(entry: CatalogEntry): void {
    if (this.entries.has(entry.id)) {
      // Remove previous capability bindings before applying an updated service definition.
      this.deregister(entry.id);
    }

    this.entries.set(entry.id, entry);

    for (const capability of entry.capabilities) {
      const priority = this.extractPriority(entry);
      const existing = this.bindings.get(capability) ?? [];
      const filtered = existing.filter((binding) => binding.providerId !== entry.id);
      filtered.push({
        capability,
        providerId: entry.id,
        priority,
      });
      this.bindings.set(
        capability,
        filtered.sort(
          (a, b) => b.priority - a.priority || a.providerId.localeCompare(b.providerId),
        ),
      );
    }
  }

  deregister(id: string): void {
    const existing = this.entries.get(id);
    if (!existing) {
      return;
    }

    this.entries.delete(id);
    for (const capability of existing.capabilities) {
      const bindings = this.bindings.get(capability) ?? [];
      const filtered = bindings.filter((binding) => binding.providerId !== id);
      if (filtered.length === 0) {
        this.bindings.delete(capability);
      } else {
        this.bindings.set(capability, filtered);
      }
    }
  }

  resolve(capability: string): CatalogEntry | undefined {
    return this.resolveAll(capability)[0];
  }

  resolveAll(capability: string): CatalogEntry[] {
    const bindings = this.bindings.get(capability) ?? [];

    return bindings
      .map((binding) => this.entries.get(binding.providerId))
      .filter((entry): entry is CatalogEntry => !!entry)
      .filter((entry) => entry.status === 'healthy');
  }

  updateStatus(id: string, status: CatalogEntry['status']): void {
    const existing = this.entries.get(id);
    if (!existing) {
      return;
    }

    this.entries.set(id, {
      ...existing,
      status,
    });
  }

  getAll(): CatalogEntry[] {
    return [...this.entries.values()];
  }

  private extractPriority(entry: CatalogEntry): number {
    const candidate = entry.metadata?.priority;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    return 0;
  }
}

export function createEventDrivenCatalog(catalog: ServiceCatalog, eventBus: EventBus) {
  const publisher = createCatalogEventPublisher(eventBus);

  return {
    async register(entry: CatalogEntry): Promise<void> {
      catalog.register(entry);
      await publisher.publishRegistered(entry);
    },
    async deregister(id: string): Promise<void> {
      catalog.deregister(id);
      await publisher.publishDeregistered(id);
    },
    async updateStatus(id: string, status: CatalogEntry['status']): Promise<void> {
      catalog.updateStatus(id, status);
      await publisher.publishStatusChanged(id, status);
    },
  };
}
