export interface CatalogEntry {
  id: string;
  name: string;
  capabilities: string[];
  healthUrl: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  metadata?: Record<string, unknown>;
}

export interface CapabilityBinding {
  capability: string;
  providerId: string;
  priority: number;
}
